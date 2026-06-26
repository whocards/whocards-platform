// Resend webhook processing (#121).
//
// Pure / dependency-injectable — no live DB or env at module load time.
// The only place a live DB is referenced is in the API route.
//
// Resend signs webhooks using Svix. The signing secret is formatted as
// whsec_<base64> and is found in Resend → Webhooks → your endpoint → Signing Secret.
//
// Assumed `contact.updated` payload shape (Resend, as of 2026-06):
//   {
//     type: 'contact.updated',
//     created_at: string,
//     data: {
//       id: string,            // Resend contact id
//       email: string,
//       first_name?: string,
//       last_name?: string,
//       unsubscribed: boolean, // true when the contact clicked "Unsubscribe"
//       audience_id: string,   // present when event is scoped to one audience/segment
//     }
//   }
//
// Assumed `contact.deleted` payload shape:
//   { type: 'contact.deleted', created_at: string, data: { id: string, email: string } }
//
// Assumed `email.bounced` / `email.complained` / `email.suppressed` payload shape:
//   { type: 'email.bounced', created_at: string, data: { email_id: string, to: string[], ... } }
//   Note: data.to is string[] per the Resend SDK (BaseEmailEventData.to). The extractor
//   handles both string and string[] defensively.
//
// All of these are defensive — we read only what we need and tolerate missing fields.

import {Webhook} from 'svix'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import type {ConsentType} from './consent'
import {normalizeEmail} from './consent'
import * as dbSchema from './db/schema'
import {unsubscribeAllActiveByEmail, unsubscribeByEmailAndType} from './db/upsert'

// ---------------------------------------------------------------------------
// UNSUBSCRIBE_SOURCE constants
// ---------------------------------------------------------------------------

/**
 * Canonical unsubscribe_source values written by the webhook handler.
 * These are written into email_consent.unsubscribe_source so we know
 * WHY a row was unsubscribed.
 */
export const UNSUBSCRIBE_SOURCE = {
  /** Contact clicked Unsubscribe on a per-topic/segment email */
  contactUnsubscribe: 'resend_contact_unsubscribe',
  /** Contact clicked Unsubscribe at the global/contact level */
  globalUnsubscribe: 'resend_global_unsubscribe',
  /** Hard bounce recorded by Resend */
  bounce: 'resend_bounce',
  /** Spam complaint recorded by Resend */
  complaint: 'resend_complaint',
  /** Resend global suppression */
  suppressed: 'resend_suppressed',
} as const

export type UnsubscribeSource = (typeof UNSUBSCRIBE_SOURCE)[keyof typeof UNSUBSCRIBE_SOURCE]

// ---------------------------------------------------------------------------
// Svix signature verification
// ---------------------------------------------------------------------------

export interface WebhookHeaders {
  'svix-id': string
  'svix-timestamp': string
  'svix-signature': string
}

/**
 * Verify a Resend webhook signature using the Svix library.
 * Throws WebhookVerificationError (from svix) when the signature is invalid.
 * Returns the parsed event payload on success.
 *
 * MUST be called with the RAW request body string (not re-serialised JSON),
 * which is what Svix signs.
 */
export function verifyResendSignature({
  secret,
  payload,
  headers,
}: {
  secret: string
  payload: string
  headers: WebhookHeaders | Record<string, string>
}): unknown {
  const wh = new Webhook(secret)
  // wh.verify throws WebhookVerificationError on bad signature.
  return wh.verify(payload, headers)
}

// ---------------------------------------------------------------------------
// Segment-id inverse resolver
// ---------------------------------------------------------------------------

/**
 * Given a Resend segment id from a webhook payload, return the matching
 * ConsentType — the INVERSE of CONSENT_TYPE_TO_SEGMENT.
 * Returns undefined when the id is not mapped.
 */
export function segmentIdToConsentType(
  segmentId: string | undefined | null,
  {
    newsletterSegmentId,
    appWaitlistSegmentId,
  }: {newsletterSegmentId: string | undefined; appWaitlistSegmentId: string | undefined}
): ConsentType | undefined {
  if (!segmentId) return undefined
  if (newsletterSegmentId && segmentId === newsletterSegmentId) return 'newsletter'
  if (appWaitlistSegmentId && segmentId === appWaitlistSegmentId) return 'app_launch'
  return undefined
}

// ---------------------------------------------------------------------------
// Tolerant event payload extractor helpers
// ---------------------------------------------------------------------------

/**
 * Extract an email address from data.email or data.to.
 * Contact events carry data.email (string); email hygiene events carry data.to
 * which is string[] per the Resend SDK (BaseEmailEventData.to). Both shapes are
 * handled defensively so a shape change never silently skips the unsubscribe.
 */
function extractEmail(data: Record<string, unknown>): string | undefined {
  const val = data['email'] ?? data['to']
  if (typeof val === 'string' && val.length > 0) return val
  if (Array.isArray(val) && typeof val[0] === 'string' && val[0].length > 0) return val[0]
  return undefined
}

/** Extract the audience/segment id from data.audience_id (contact.updated scoped events). */
function extractSegmentId(data: Record<string, unknown>): string | undefined {
  const val = data['audience_id']
  return typeof val === 'string' && val.length > 0 ? val : undefined
}

// ---------------------------------------------------------------------------
// Dispatcher return type
// ---------------------------------------------------------------------------

export type DispatchSummary = {
  /** The Resend event type string, e.g. 'contact.updated' */
  type: string
  /**
   * What the dispatcher did:
   * - 'unsubscribed_scoped'  — unsubscribed one consent row (topic/segment scope)
   * - 'unsubscribed_global'  — unsubscribed all active rows for the email
   * - 'ignored'              — event type is not actionable (no DB change)
   * - 'no_email'             — payload had no extractable email (no DB change)
   */
  action: 'unsubscribed_scoped' | 'unsubscribed_global' | 'ignored' | 'no_email'
  /** Number of consent rows actually updated (0 for ignored/no_email). */
  affectedRows: number
}

export interface DispatchSegmentIds {
  newsletterSegmentId: string | undefined
  appWaitlistSegmentId: string | undefined
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a verified Resend webhook event to the appropriate DB action.
 * Does NOT verify signatures — the route does that before calling this.
 * Never throws for unknown/irrelevant event types; always returns a summary.
 *
 * @param db         Live or in-test Drizzle/PGlite database handle.
 * @param event      The parsed event payload (result of verifyResendSignature).
 * @param segmentIds The configured Resend segment ids, used for scope resolution.
 * @param logger     Optional logger; defaults to console.
 */
export async function dispatchResendEvent<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof dbSchema>,
  event: unknown,
  {
    segmentIds,
    logger,
  }: {
    segmentIds: DispatchSegmentIds
    logger?: {
      info: (msg: string, ...args: unknown[]) => void
      warn: (msg: string, ...args: unknown[]) => void
      error: (msg: string, ...args: unknown[]) => void
    }
  }
): Promise<DispatchSummary> {
  const log = logger ?? console

  // Defensively cast event to a loosely-typed record.
  if (typeof event !== 'object' || event === null) {
    log.warn('resend-webhook: received non-object event payload')
    return {type: 'unknown', action: 'ignored', affectedRows: 0}
  }

  const ev = event as Record<string, unknown>
  const type = typeof ev['type'] === 'string' ? ev['type'] : 'unknown'
  const rawData =
    typeof ev['data'] === 'object' && ev['data'] !== null
      ? (ev['data'] as Record<string, unknown>)
      : {}

  // -------------------------------------------------------------------------
  // contact.updated — the primary unsubscribe signal from Resend
  // -------------------------------------------------------------------------
  if (type === 'contact.updated') {
    // Only act when the payload signals an actual unsubscribe.
    const unsubscribed = rawData['unsubscribed']
    if (unsubscribed !== true) {
      // Contact was updated for some other reason (name edit, etc.) — ignore.
      log.info('resend-webhook: contact.updated with unsubscribed=%s — ignoring', unsubscribed)
      return {type, action: 'ignored', affectedRows: 0}
    }

    const rawEmail = extractEmail(rawData)
    if (!rawEmail) {
      log.warn('resend-webhook: contact.updated — no email in payload, cannot unsubscribe')
      return {type, action: 'no_email', affectedRows: 0}
    }
    const email = normalizeEmail(rawEmail)

    // Check if the event is scoped to a specific segment/audience.
    const rawSegmentId = extractSegmentId(rawData)

    if (rawSegmentId) {
      // The event is scoped to one segment. Only act when we can map it to a
      // known consent type. An UNMAPPED segment id (renamed, brand-new, or env
      // vars not yet configured) must NOT fall through to a global unsubscribe —
      // that would wipe consent the user never opted out of. Ignore and log for
      // follow-up instead.
      const consentType = segmentIdToConsentType(rawSegmentId, segmentIds)
      if (!consentType) {
        log.warn(
          'resend-webhook: contact.updated unsubscribe for an UNMAPPED segment id %s — ignoring (not treating as global unsubscribe)',
          rawSegmentId
        )
        return {type, action: 'ignored', affectedRows: 0}
      }

      // Topic-scoped unsubscribe: only update the one consent type that maps to this segment.
      log.info(
        'resend-webhook: contact.updated unsubscribe scoped to segment %s (%s)',
        rawSegmentId,
        consentType
      )
      const affectedRows = await unsubscribeByEmailAndType(db, {
        email,
        consentType,
        source: UNSUBSCRIBE_SOURCE.contactUnsubscribe,
      })
      return {type, action: 'unsubscribed_scoped', affectedRows}
    }

    // No segment scope at all → a contact-level (global) unsubscribe.
    log.info('resend-webhook: contact.updated global unsubscribe (no segment scope)')
    const affectedRows = await unsubscribeAllActiveByEmail(db, {
      email,
      source: UNSUBSCRIBE_SOURCE.globalUnsubscribe,
    })
    return {type, action: 'unsubscribed_global', affectedRows}
  }

  // -------------------------------------------------------------------------
  // contact.deleted — hygiene: treat as global unsubscribe
  // -------------------------------------------------------------------------
  if (type === 'contact.deleted') {
    const rawEmail = extractEmail(rawData)
    if (!rawEmail) {
      log.warn('resend-webhook: contact.deleted — no email in payload')
      return {type, action: 'no_email', affectedRows: 0}
    }
    const email = normalizeEmail(rawEmail)
    log.info('resend-webhook: contact.deleted — global unsubscribe')
    const affectedRows = await unsubscribeAllActiveByEmail(db, {
      email,
      source: UNSUBSCRIBE_SOURCE.globalUnsubscribe,
    })
    return {type, action: 'unsubscribed_global', affectedRows}
  }

  // -------------------------------------------------------------------------
  // email.bounced — hygiene: unsubscribe all active rows for the recipient
  // -------------------------------------------------------------------------
  if (type === 'email.bounced') {
    const rawEmail = extractEmail(rawData)
    if (!rawEmail) {
      log.warn('resend-webhook: email.bounced — no email in payload')
      return {type, action: 'no_email', affectedRows: 0}
    }
    const email = normalizeEmail(rawEmail)
    log.info('resend-webhook: email.bounced — unsubscribing all active rows')
    const affectedRows = await unsubscribeAllActiveByEmail(db, {
      email,
      source: UNSUBSCRIBE_SOURCE.bounce,
    })
    return {type, action: 'unsubscribed_global', affectedRows}
  }

  // -------------------------------------------------------------------------
  // email.complained — spam complaint: unsubscribe all active rows
  // -------------------------------------------------------------------------
  if (type === 'email.complained') {
    const rawEmail = extractEmail(rawData)
    if (!rawEmail) {
      log.warn('resend-webhook: email.complained — no email in payload')
      return {type, action: 'no_email', affectedRows: 0}
    }
    const email = normalizeEmail(rawEmail)
    log.info('resend-webhook: email.complained — unsubscribing all active rows')
    const affectedRows = await unsubscribeAllActiveByEmail(db, {
      email,
      source: UNSUBSCRIBE_SOURCE.complaint,
    })
    return {type, action: 'unsubscribed_global', affectedRows}
  }

  // -------------------------------------------------------------------------
  // email.suppressed — global suppression
  // -------------------------------------------------------------------------
  if (type === 'email.suppressed') {
    const rawEmail = extractEmail(rawData)
    if (!rawEmail) {
      log.warn('resend-webhook: email.suppressed — no email in payload')
      return {type, action: 'no_email', affectedRows: 0}
    }
    const email = normalizeEmail(rawEmail)
    log.info('resend-webhook: email.suppressed — unsubscribing all active rows')
    const affectedRows = await unsubscribeAllActiveByEmail(db, {
      email,
      source: UNSUBSCRIBE_SOURCE.suppressed,
    })
    return {type, action: 'unsubscribed_global', affectedRows}
  }

  // -------------------------------------------------------------------------
  // All other event types: email.sent, email.delivered, email.delivery_delayed,
  // email.opened, email.clicked, contact.created, and any unknown type.
  // Log at info and ignore — these are validly-signed deliveries that require
  // no action; never throw for these.
  // -------------------------------------------------------------------------
  log.info('resend-webhook: ignoring event type=%s', type)
  return {type, action: 'ignored', affectedRows: 0}
}
