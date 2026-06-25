// Resend Contacts sync helper (#120).
//
// All Resend interaction is dependency-injected so unit tests can mock everything
// without any real network calls. The only place a live Resend client is
// constructed is in the API route and the reconciliation script.
//
// SDK shape (resend@6.14.0):
//   resend.contacts.create({ email, firstName?, segments: [{id}] })
//   resend.contacts.get({ email } | { id })  → {data: {id, email, ...}, error}
//   resend.contacts.segments.add({ email, segmentId })
//
// "Segments" in Resend are the unit we sync contacts into (previously called
// Audiences in older SDK versions). We store the segment id as
// provider_segment_id on the email_consent row.

import {and, eq, isNotNull, isNull, or} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import type {ConsentType} from './consent'
import * as schema from './db/schema'

// ---------------------------------------------------------------------------
// Segment-id resolver — pure helper, no env import (injected by callers).
// ---------------------------------------------------------------------------

/** Maps a ConsentType to a configured Resend segment id (or undefined). */
export type SegmentIdResolver = (consentType: ConsentType) => string | undefined

/** Build a resolver from the two optional env vars. */
export const makeSegmentIdResolver =
  (newsletterId: string | undefined, appWaitlistId: string | undefined): SegmentIdResolver =>
  (consentType: ConsentType) => {
    if (consentType === 'newsletter') return newsletterId
    if (consentType === 'app_launch') return appWaitlistId
    return undefined
  }

// ---------------------------------------------------------------------------
// Injected Resend Contacts interface — subset we use; easy to fake in tests.
// ---------------------------------------------------------------------------

/** Selecting shape for get/update — mirrors the SDK's SelectingField. */
export type ResendSelectingField = {id: string; email?: undefined | null} | {email: string; id?: undefined | null}

export interface ResendContactsPort {
  /** Create a contact (with optional segment membership). Returns {data: {id}, error}. */
  create(payload: {
    email: string
    firstName?: string
    segments?: {id: string}[]
  }): Promise<{data: {id: string} | null; error: {message: string; name: string} | null}>

  /** Get a contact by id or email. Returns {data: {id, email, ...}, error}. */
  get(options: ResendSelectingField): Promise<{
    data: {id: string; email: string} | null
    error: {message: string; name: string} | null
  }>

  /** Add an existing contact to a segment. Returns {data, error}. */
  addToSegment(options: {
    email: string
    segmentId: string
  }): Promise<{data: {id: string} | null; error: {message: string; name: string} | null}>
}

export interface SyncDeps {
  resendContacts: ResendContactsPort
  segmentIdFor: SegmentIdResolver
  logger?: {
    info: (msg: string, ...args: unknown[]) => void
    warn: (msg: string, ...args: unknown[]) => void
    error: (msg: string, ...args: unknown[]) => void
  }
}

// ---------------------------------------------------------------------------
// Sync result types
// ---------------------------------------------------------------------------

export type SyncResult =
  | {status: 'synced'; contactId: string; segmentId: string}
  | {status: 'skipped'; reason: string}
  | {status: 'failed'; error: string}

/** Minimal shape of an email_consent row needed for sync. */
export type ConsentRowForSync = {
  id: number
  email: string
  name: string | null
  consentType: string
}

// ---------------------------------------------------------------------------
// Core per-consent-row sync
// ---------------------------------------------------------------------------

/**
 * Returns true when a create error is definitely fatal (misconfigured key,
 * missing required field, etc.) and should NOT fall through to the
 * get+addToSegment path.
 *
 * We take the conservative approach: only known-fatal error names short-circuit;
 * everything else (including ambiguous application_error / validation_error that
 * may contain "already exist") falls through to the idempotent segment-add path.
 * That way a bulk reconciliation re-run always converges rather than recording
 * spurious failures.
 */
function isDefinitelyFatalCreateError(error: {name: string; message: string}): boolean {
  const fatal = new Set([
    'authentication_error', // bad API key
    'missing_required_field', // bad payload we constructed
    'invalid_access',
  ])
  return fatal.has(error.name)
}

/**
 * Sync one active (not unsubscribed) consent row to Resend.
 *
 * Idempotency strategy:
 *   1. Attempt contacts.create with segments. On success → synced.
 *   2. On ANY non-fatal create error (including "already exists" in any form),
 *      fall through to contacts.get(email) + contacts.segments.add.
 *      segments.add is idempotent on Resend's side — safe to repeat.
 *   3. Only truly fatal errors (auth failure, bad payload) are surfaced as failed.
 *
 * This means: syncing the same contact twice always converges to `synced`.
 * A contact with BOTH consents ends up in BOTH segments on every run.
 *
 * Returns a SyncResult — never throws.
 */
export async function syncConsentToResend(
  consent: ConsentRowForSync,
  deps: SyncDeps
): Promise<SyncResult> {
  const {resendContacts, segmentIdFor, logger} = deps
  const log = logger ?? console

  const segmentId = segmentIdFor(consent.consentType as ConsentType)
  if (!segmentId) {
    log.info('resend-sync: no segment configured for %s — skipping', consent.consentType)
    return {status: 'skipped', reason: 'no_segment_configured'}
  }

  const firstName = consent.name?.split(' ')[0] ?? undefined

  try {
    // Attempt create-with-segment.
    const createResult = await resendContacts.create({
      email: consent.email,
      ...(firstName ? {firstName} : {}),
      segments: [{id: segmentId}],
    })

    if (!createResult.error && createResult.data?.id) {
      log.info(
        'resend-sync: created contact %s in segment %s (contactId=%s)',
        consent.email,
        segmentId,
        createResult.data.id
      )
      return {status: 'synced', contactId: createResult.data.id, segmentId}
    }

    // If it's a definitely-fatal error, surface it immediately.
    if (createResult.error && isDefinitelyFatalCreateError(createResult.error)) {
      const msg = createResult.error.message
      log.error('resend-sync: fatal create error for %s: %s', consent.email, msg)
      return {status: 'failed', error: msg}
    }

    // Any other create error (already exists, application_error, etc.) →
    // fall through to get + addToSegment for idempotency.
    if (createResult.error) {
      log.warn(
        'resend-sync: create returned error for %s (%s: %s) — falling through to segment-add path',
        consent.email,
        createResult.error.name,
        createResult.error.message
      )
    }

    // Fetch the contact's id (it may already exist) then add to segment.
    const getResult = await resendContacts.get({email: consent.email})
    if (getResult.error || !getResult.data) {
      const msg = getResult.error?.message ?? 'get failed'
      log.error('resend-sync: get error for %s: %s', consent.email, msg)
      return {status: 'failed', error: msg}
    }

    const contactId = getResult.data.id
    const addResult = await resendContacts.addToSegment({email: consent.email, segmentId})

    if (addResult.error) {
      const msg = addResult.error.message ?? 'addToSegment failed'
      log.error('resend-sync: addToSegment error for %s: %s', consent.email, msg)
      return {status: 'failed', error: msg}
    }

    log.info(
      'resend-sync: added contact %s to segment %s (contactId=%s)',
      consent.email,
      segmentId,
      contactId
    )
    return {status: 'synced', contactId, segmentId}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('resend-sync: threw for %s: %s', consent.email, msg)
    return {status: 'failed', error: msg}
  }
}

// ---------------------------------------------------------------------------
// Apply sync result to DB (provider_* columns)
// ---------------------------------------------------------------------------

/**
 * Write the provider sync outcome back to the email_consent row.
 * Pure of live Resend — takes only a DB handle and a SyncResult.
 *
 * - synced  → sets provider_contact_id, provider_segment_id, provider_synced_at=now, clears provider_sync_error
 * - failed  → sets provider_sync_error (leaves provider_synced_at unchanged)
 * - skipped → no-op
 */
export async function applyProviderSyncResult<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema>,
  consentId: number,
  result: SyncResult
): Promise<void> {
  if (result.status === 'skipped') return

  const {emailConsent} = schema

  if (result.status === 'synced') {
    await db
      .update(emailConsent)
      .set({
        providerContactId: result.contactId,
        providerSegmentId: result.segmentId,
        providerSyncedAt: new Date().toISOString(),
        providerSyncError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(emailConsent.id, consentId))
    return
  }

  // status === 'failed'
  await db
    .update(emailConsent)
    .set({
      providerSyncError: result.error,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(emailConsent.id, consentId))
}

// ---------------------------------------------------------------------------
// Convenience: sync all active consents for one email
// ---------------------------------------------------------------------------

export type EmailSyncSummary = {
  consentId: number
  consentType: string
  result: SyncResult
}

/**
 * Load all active (unsubscribed_at IS NULL) consent rows for a given email
 * and best-effort sync each one, applying results to DB.
 * Never throws — individual failures are captured in the returned summaries.
 */
export async function syncEmailConsents<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema>,
  email: string,
  deps: SyncDeps
): Promise<EmailSyncSummary[]> {
  const {emailConsent} = schema

  const rows = await db
    .select()
    .from(emailConsent)
    .where(and(eq(emailConsent.email, email), isNull(emailConsent.unsubscribedAt)))

  const summaries: EmailSyncSummary[] = []

  for (const row of rows) {
    const result = await syncConsentToResend(row as ConsentRowForSync, deps)
    await applyProviderSyncResult(db, row.id, result)
    summaries.push({consentId: row.id, consentType: row.consentType, result})
  }

  return summaries
}

// ---------------------------------------------------------------------------
// Reconciliation helpers (pure/testable — no live DB or Resend required)
// ---------------------------------------------------------------------------

/** A row shape used by the reconciliation script. */
export type ReconcileRow = {
  id: number
  email: string
  name: string | null
  consentType: string
  providerSyncedAt: string | null
  providerSyncError: string | null
}

/** Returns true if a consent row needs a sync attempt in the reconciliation pass. */
export function needsSync(row: ReconcileRow): boolean {
  return row.providerSyncedAt === null || row.providerSyncError !== null
}

/** Drizzle WHERE clause selecting active consent rows that need provider sync. */
export function buildNeedsSyncWhere() {
  const {emailConsent} = schema
  return and(
    isNull(emailConsent.unsubscribedAt),
    or(isNull(emailConsent.providerSyncedAt), isNotNull(emailConsent.providerSyncError))
  )
}

// ---------------------------------------------------------------------------
// Reconciliation core — extracted for testability (FIX 4)
// ---------------------------------------------------------------------------

export type ReconcileCounts = {
  scanned: number
  synced: number
  wouldSync: number
  skipped: number
  failed: number
}

export type ReconcileOptions<T extends PgQueryResultHKT> = {
  db: PgDatabase<T, typeof schema>
  deps: SyncDeps
  apply: boolean
  /** Called to upsert a legacy newsletter consent row before syncing. */
  upsertConsentFn: (
    db: PgDatabase<T, typeof schema>,
    args: {email: string; name: string; userId: number}
  ) => Promise<{id: number; email: string; name: string | null; consentType: string} | undefined>
  logger?: SyncDeps['logger']
}

/**
 * Core reconciliation logic — extracted so tests can drive it against PGlite
 * without touching the live CLI entry-point.
 *
 * In dry-run (apply=false): reads DB, counts what would sync, makes ZERO
 * Resend API calls and ZERO provider-column DB writes.
 * In apply mode: syncs each row and writes results back.
 */
export async function reconcile<T extends PgQueryResultHKT>(
  opts: ReconcileOptions<T>
): Promise<ReconcileCounts> {
  const {db, deps, apply, upsertConsentFn, logger} = opts
  const log = logger ?? console
  const {emailConsent, users} = schema

  // 1. Active consent rows needing sync (DB-filtered via buildNeedsSyncWhere).
  const toSync = await db
    .select()
    .from(emailConsent)
    .where(buildNeedsSyncWhere())

  log.info('[reconcile] Found %d consent rows needing sync.', toSync.length)

  // 2. Legacy user.newsletter=true with no newsletter consent row.
  // N+1 lookups are intentional here — this is a run-once migration script.
  const newsletterUsers = await db.select().from(users).where(eq(users.newsletter, true))
  const legacyToBackfill: (typeof newsletterUsers)[number][] = []
  for (const u of newsletterUsers) {
    const existing = await db
      .select({id: emailConsent.id})
      .from(emailConsent)
      .where(and(eq(emailConsent.email, u.email), eq(emailConsent.consentType, 'newsletter')))
    if (existing.length === 0) legacyToBackfill.push(u)
  }

  log.info('[reconcile] Found %d legacy newsletter users to backfill.', legacyToBackfill.length)

  let synced = 0
  let wouldSync = 0
  let skipped = 0
  let failed = 0

  if (apply) {
    // --- apply mode: sync + write ---
    for (const row of toSync) {
      const result = await syncConsentToResend(row as ConsentRowForSync, deps)
      await applyProviderSyncResult(db, row.id, result)
      if (result.status === 'synced') synced++
      else if (result.status === 'skipped') skipped++
      else failed++
    }

    for (const u of legacyToBackfill) {
      const row = await upsertConsentFn(db, {email: u.email, name: u.name, userId: u.id})
      if (row) {
        const result = await syncConsentToResend(row, deps)
        await applyProviderSyncResult(db, row.id, result)
        if (result.status === 'synced') synced++
        else if (result.status === 'skipped') skipped++
        else failed++
      }
    }
  } else {
    // --- dry-run mode: count only, zero Resend/DB writes ---
    for (const row of toSync) {
      const segId = deps.segmentIdFor(row.consentType as ConsentType)
      if (segId) wouldSync++
      else skipped++
    }
    const nlSegId = deps.segmentIdFor('newsletter')
    for (const _u of legacyToBackfill) {
      if (nlSegId) wouldSync++
      else skipped++
    }
  }

  return {scanned: toSync.length, synced, wouldSync, skipped, failed}
}
