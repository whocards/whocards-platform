// Tests for the Resend webhook processor (#121).
//
// All DB assertions use PGlite (same pattern as upsert.test.ts).
// Signature verification is tested with the real svix library — no network calls.

import {PGlite} from '@electric-sql/pglite'
import {eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {Webhook} from 'svix'
import * as schema from './db/schema'
import {upsertConsent} from './db/upsert'
import {
  verifyResendSignature,
  dispatchResendEvent,
  segmentIdToConsentType,
  UNSUBSCRIBE_SOURCE,
  type WebhookHeaders,
  type DispatchSegmentIds,
} from './resend-webhook'

// ---------------------------------------------------------------------------
// PGlite DB setup (mirrors upsert.test.ts)
// ---------------------------------------------------------------------------

const CREATE_TABLES = `
  CREATE TABLE "user" (
    "id" serial PRIMARY KEY,
    "email" text NOT NULL UNIQUE,
    "name" text NOT NULL,
    "newsletter" boolean DEFAULT false NOT NULL,
    "oc_slug" text
  );

  CREATE TABLE "email_consent" (
    "id" serial PRIMARY KEY,
    "user_id" integer REFERENCES "user"("id"),
    "email" text NOT NULL,
    "name" text,
    "consent_type" text NOT NULL,
    "consented_at" timestamptz DEFAULT now() NOT NULL,
    "consent_source" text NOT NULL,
    "unsubscribed_at" timestamptz,
    "unsubscribe_source" text,
    "fulfilled_at" timestamptz,
    "provider_name" text DEFAULT 'resend' NOT NULL,
    "provider_contact_id" text,
    "provider_segment_id" text,
    "provider_synced_at" timestamptz,
    "provider_sync_error" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz,
    CONSTRAINT "email_consent_email_consent_type_unique" UNIQUE ("email", "consent_type")
  );
`

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

// One PGlite (WASM) instance is shared across the file. Instantiating a fresh
// one per test paid the cold WASM-compile cost on every `it`, which pushed the
// first hook past vitest's 10s default hookTimeout on CI's slower runners.
// Tables are truncated between tests for isolation instead.
beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, {schema})
  await client.exec(CREATE_TABLES)
})

beforeEach(async () => {
  await client.exec('TRUNCATE "email_consent", "user" RESTART IDENTITY CASCADE;')
})

// ---------------------------------------------------------------------------
// Test secret and helper to produce valid svix-signed headers
// ---------------------------------------------------------------------------

// A deterministic test signing secret (whsec_ format, base64-encoded 32 bytes).
const TEST_SECRET = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64')

/**
 * Sign a payload with the test secret and return headers + msg-id.
 * Mirrors what Resend does before delivering the webhook.
 */
function signPayload(
  payload: string,
  msgId = 'msg_test_' + Date.now()
): WebhookHeaders & {'svix-id': string} {
  const wh = new Webhook(TEST_SECRET)
  const now = new Date()
  // wh.sign returns the full "svix-signature" header value (v1,<base64>)
  const sig = wh.sign(msgId, now, payload)
  return {
    'svix-id': msgId,
    'svix-timestamp': Math.floor(now.getTime() / 1000).toString(),
    'svix-signature': sig,
  }
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const TEST_SEGMENT_IDS: DispatchSegmentIds = {
  newsletterSegmentId: 'seg-nl-001',
  appWaitlistSegmentId: 'seg-wl-002',
}

// ---------------------------------------------------------------------------
// 1. Signature verification
// ---------------------------------------------------------------------------

describe('verifyResendSignature', () => {
  it('successfully verifies a correctly-signed payload', () => {
    const payload = JSON.stringify({type: 'contact.updated', data: {email: 'a@b.com'}})
    const headers = signPayload(payload)

    expect(() => verifyResendSignature({secret: TEST_SECRET, payload, headers})).not.toThrow()
  })

  it('returns the parsed event object on success', () => {
    const eventObj = {type: 'contact.updated', data: {email: 'a@b.com', unsubscribed: true}}
    const payload = JSON.stringify(eventObj)
    const headers = signPayload(payload)

    const result = verifyResendSignature({secret: TEST_SECRET, payload, headers})
    expect(result).toMatchObject({type: 'contact.updated'})
  })

  it('throws when the body is tampered after signing', () => {
    const payload = JSON.stringify({type: 'contact.updated', data: {email: 'a@b.com'}})
    const headers = signPayload(payload)
    const tamperedPayload = payload + ' '

    expect(() =>
      verifyResendSignature({secret: TEST_SECRET, payload: tamperedPayload, headers})
    ).toThrow()
  })

  it('throws when the signature header is tampered', () => {
    const payload = JSON.stringify({type: 'contact.updated', data: {email: 'a@b.com'}})
    const headers = signPayload(payload)

    expect(() =>
      verifyResendSignature({
        secret: TEST_SECRET,
        payload,
        headers: {...headers, 'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='},
      })
    ).toThrow()
  })

  it('throws when a wrong secret is used', () => {
    const payload = JSON.stringify({type: 'contact.updated', data: {email: 'a@b.com'}})
    const headers = signPayload(payload)
    const wrongSecret = 'whsec_' + Buffer.from('b'.repeat(32)).toString('base64')

    expect(() => verifyResendSignature({secret: wrongSecret, payload, headers})).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. segmentIdToConsentType — inverse resolver
// ---------------------------------------------------------------------------

describe('segmentIdToConsentType', () => {
  it('maps the newsletter segment id to newsletter', () => {
    expect(
      segmentIdToConsentType('seg-nl-001', {
        newsletterSegmentId: 'seg-nl-001',
        appWaitlistSegmentId: 'seg-wl-002',
      })
    ).toBe('newsletter')
  })

  it('maps the app waitlist segment id to app_launch', () => {
    expect(
      segmentIdToConsentType('seg-wl-002', {
        newsletterSegmentId: 'seg-nl-001',
        appWaitlistSegmentId: 'seg-wl-002',
      })
    ).toBe('app_launch')
  })

  it('returns undefined for an unmapped segment id', () => {
    expect(
      segmentIdToConsentType('seg-unknown-999', {
        newsletterSegmentId: 'seg-nl-001',
        appWaitlistSegmentId: 'seg-wl-002',
      })
    ).toBeUndefined()
  })

  it('returns undefined when segmentId is null/undefined', () => {
    expect(
      segmentIdToConsentType(null, {
        newsletterSegmentId: 'seg-nl-001',
        appWaitlistSegmentId: 'seg-wl-002',
      })
    ).toBeUndefined()
    expect(
      segmentIdToConsentType(undefined, {
        newsletterSegmentId: 'seg-nl-001',
        appWaitlistSegmentId: 'seg-wl-002',
      })
    ).toBeUndefined()
  })

  it('returns undefined when the segment id env vars are both absent', () => {
    expect(
      segmentIdToConsentType('seg-nl-001', {
        newsletterSegmentId: undefined,
        appWaitlistSegmentId: undefined,
      })
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. contact.updated — topic/segment-scoped unsubscribe
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — contact.updated scoped unsubscribe', () => {
  it('unsubscribes only the mapped consent row; leaves the other active', async () => {
    // Both newsletter and app_launch consent rows for the same email.
    await upsertConsent(db, {
      email: 'scoped@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'scoped@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    // Webhook fires for the newsletter segment only.
    const event = {
      type: 'contact.updated',
      data: {
        email: 'scoped@example.com',
        unsubscribed: true,
        audience_id: 'seg-nl-001', // newsletter segment
      },
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_scoped')
    expect(summary.affectedRows).toBe(1)

    const rows = await db.select().from(schema.emailConsent)
    const newsletter = rows.find((r) => r.consentType === 'newsletter')
    const appLaunch = rows.find((r) => r.consentType === 'app_launch')

    // Newsletter row is unsubscribed.
    expect(newsletter?.unsubscribedAt).not.toBeNull()
    expect(newsletter?.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.contactUnsubscribe)

    // App launch row is still active.
    expect(appLaunch?.unsubscribedAt).toBeNull()
    expect(appLaunch?.unsubscribeSource).toBeNull()
  })

  it('normalizes email case before lookup', async () => {
    await upsertConsent(db, {
      email: 'upper@example.com', // stored lowercase
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {
        email: 'UPPER@EXAMPLE.COM', // arrives uppercase
        unsubscribed: true,
        audience_id: 'seg-nl-001',
      },
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.affectedRows).toBe(1)
    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribedAt).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. contact.updated — global unsubscribe (no segment scope)
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — contact.updated global unsubscribe', () => {
  it('unsubscribes ALL active consent rows for the email when no segment is scoped', async () => {
    await upsertConsent(db, {
      email: 'global@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'global@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {
        email: 'global@example.com',
        unsubscribed: true,
        // no audience_id → global scope
      },
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(2)

    const rows = await db.select().from(schema.emailConsent)
    for (const row of rows) {
      expect(row.unsubscribedAt).not.toBeNull()
      expect(row.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.globalUnsubscribe)
    }
  })

  it('ignores a scoped unsubscribe for an unmapped segment id — never a global wipe', async () => {
    await upsertConsent(db, {
      email: 'unmapped@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'unmapped@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {
        email: 'unmapped@example.com',
        unsubscribed: true,
        audience_id: 'seg-completely-unknown-xyz', // not in TEST_SEGMENT_IDS
      },
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    // A scoped event for an unknown segment must NOT fall through to a global
    // unsubscribe — that would wipe consent the user never opted out of. Ignore it.
    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)

    // Both consent rows remain active.
    const rows = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.email, 'unmapped@example.com'))
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.unsubscribedAt).toBeNull()
  })

  it('ignores contact.updated when unsubscribed is false (benign update)', async () => {
    await upsertConsent(db, {
      email: 'benign@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {
        email: 'benign@example.com',
        unsubscribed: false, // NOT an unsubscribe
      },
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)

    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribedAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. contact.deleted — global unsubscribe
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — contact.deleted', () => {
  it('unsubscribes all active rows, source = resend_global_unsubscribe', async () => {
    await upsertConsent(db, {
      email: 'deleted@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'deleted@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.deleted',
      data: {id: 'contact-xyz', email: 'deleted@example.com'},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(2)

    const rows = await db.select().from(schema.emailConsent)
    for (const row of rows) {
      expect(row.unsubscribedAt).not.toBeNull()
      expect(row.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.globalUnsubscribe)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Missing consent rows — no throw, 0 affected
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — no consent rows for email', () => {
  it('does not throw and returns 0 affectedRows for contact.updated (no rows to update)', async () => {
    const event = {
      type: 'contact.updated',
      data: {email: 'nobody@example.com', unsubscribed: true},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(0)
  })

  it('does not throw and returns 0 affectedRows for email.bounced (no rows to update)', async () => {
    const event = {
      type: 'email.bounced',
      data: {to: 'ghost@example.com'},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Idempotency — repeated events affect 0 rows on second delivery
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — idempotency', () => {
  it('second identical contact.updated unsubscribe affects 0 rows', async () => {
    await upsertConsent(db, {
      email: 'idempotent@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {email: 'idempotent@example.com', unsubscribed: true},
    }

    const s1 = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(s1.affectedRows).toBe(1)

    // Second delivery of the same event — unsubscribed_at is already set.
    const s2 = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(s2.affectedRows).toBe(0) // idempotent: no rows updated again
  })

  it('second contact.deleted affects 0 rows', async () => {
    await upsertConsent(db, {
      email: 'idem2@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.deleted',
      data: {id: 'c-001', email: 'idem2@example.com'},
    }

    const s1 = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(s1.affectedRows).toBe(1)

    const s2 = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(s2.affectedRows).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Hygiene events
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — email.bounced', () => {
  it('unsubscribes all active rows with source = resend_bounce', async () => {
    await upsertConsent(db, {
      email: 'bounced@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'bounced@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'email.bounced',
      // data.to is string[] per the Resend SDK (BaseEmailEventData.to)
      data: {email_id: 'e-001', to: ['bounced@example.com']},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(2)

    const rows = await db.select().from(schema.emailConsent)
    for (const row of rows) {
      expect(row.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.bounce)
    }
  })
})

describe('dispatchResendEvent — email.complained', () => {
  it('unsubscribes all active rows with source = resend_complaint', async () => {
    await upsertConsent(db, {
      email: 'spammer@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const event = {
      type: 'email.complained',
      // data.to is string[] per the Resend SDK
      data: {to: ['spammer@example.com']},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(1)

    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.complaint)
  })
})

describe('dispatchResendEvent — email.suppressed', () => {
  it('unsubscribes all active rows with source = resend_suppressed', async () => {
    await upsertConsent(db, {
      email: 'suppressed@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'email.suppressed',
      data: {email: 'suppressed@example.com'},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(1)

    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.suppressed)
  })
})

// ---------------------------------------------------------------------------
// 9. Ignored event types
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — ignored event types', () => {
  it('ignores email.delivered — action=ignored, no DB change', async () => {
    await upsertConsent(db, {
      email: 'delivered@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const event = {type: 'email.delivered', data: {to: 'delivered@example.com'}}
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)

    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribedAt).toBeNull()
  })

  it('ignores email.opened', async () => {
    const event = {type: 'email.opened', data: {to: 'opened@example.com'}}
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)
  })

  it('ignores contact.created', async () => {
    const event = {type: 'contact.created', data: {email: 'created@example.com'}}
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)
  })

  it('ignores unknown event type foo.bar without throwing', async () => {
    const event = {type: 'foo.bar', data: {}}
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })
    expect(summary.type).toBe('foo.bar')
    expect(summary.action).toBe('ignored')
    expect(summary.affectedRows).toBe(0)
  })

  it('ignores email.sent', async () => {
    const summary = await dispatchResendEvent(
      db,
      {type: 'email.sent', data: {to: 'x@x.com'}},
      {segmentIds: TEST_SEGMENT_IDS, logger: silentLogger}
    )
    expect(summary.action).toBe('ignored')
  })

  it('ignores email.clicked', async () => {
    const summary = await dispatchResendEvent(
      db,
      {type: 'email.clicked', data: {to: 'x@x.com'}},
      {segmentIds: TEST_SEGMENT_IDS, logger: silentLogger}
    )
    expect(summary.action).toBe('ignored')
  })
})

// ---------------------------------------------------------------------------
// 10. Verify the unsubscribedAt timestamp is set on scoped unsubscribe
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — DB state after scoped unsubscribe', () => {
  it('sets unsubscribed_at to a non-null timestamp on the scoped row', async () => {
    await upsertConsent(db, {
      email: 'ts@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const event = {
      type: 'contact.updated',
      data: {email: 'ts@example.com', unsubscribed: true, audience_id: 'seg-wl-002'},
    }

    await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    const [row] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.email, 'ts@example.com'))

    expect(row?.unsubscribedAt).not.toBeNull()
    expect(row?.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.contactUnsubscribe)
    // updatedAt should also be set.
    expect(row?.updatedAt).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 11. Hygiene event with no recipient field → no_email, no throw
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — hygiene event missing recipient', () => {
  it('email.bounced with no to/email field returns no_email and does not throw', async () => {
    await upsertConsent(db, {
      email: 'some@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    // Payload has no recipient field at all.
    const event = {type: 'email.bounced', data: {email_id: 'e-001'}}
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    expect(summary.action).toBe('no_email')
    expect(summary.affectedRows).toBe(0)

    // No row should have been touched.
    const [row] = await db.select().from(schema.emailConsent)
    expect(row?.unsubscribedAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 12. Global unsubscribe with one already-unsubscribed row
//     The unsubscribed_at IS NULL guard must protect the prior unsubscribe_source.
// ---------------------------------------------------------------------------

describe('dispatchResendEvent — partial already-unsubscribed state', () => {
  it('only touches the still-active row; already-unsubscribed row keeps its original source', async () => {
    // Insert two consent rows.
    await upsertConsent(db, {
      email: 'partial@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'partial@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    // Pre-unsubscribe the newsletter row via a different path (e.g. user request).
    // Use a raw SQL UPDATE to sidestep the helper guard — simulating a prior unsubscribe
    // that already happened through a different flow.
    await db
      .update(schema.emailConsent)
      .set({unsubscribedAt: '2025-01-01T00:00:00Z', unsubscribeSource: 'user_request'})
      .where(eq(schema.emailConsent.consentType, 'newsletter'))

    // Verify setup: newsletter unsubscribed, app_launch still active.
    const before = await db.select().from(schema.emailConsent)
    const nlBefore = before.find((r) => r.consentType === 'newsletter')
    const alBefore = before.find((r) => r.consentType === 'app_launch')
    expect(nlBefore?.unsubscribedAt).not.toBeNull()
    expect(alBefore?.unsubscribedAt).toBeNull()

    // Global unsubscribe event arrives (e.g. contact.updated with no segment scope).
    const event = {
      type: 'contact.updated',
      data: {email: 'partial@example.com', unsubscribed: true},
    }

    const summary = await dispatchResendEvent(db, event, {
      segmentIds: TEST_SEGMENT_IDS,
      logger: silentLogger,
    })

    // Only the still-active app_launch row should have been updated.
    expect(summary.action).toBe('unsubscribed_global')
    expect(summary.affectedRows).toBe(1)

    const rows = await db.select().from(schema.emailConsent)
    const newsletter = rows.find((r) => r.consentType === 'newsletter')
    const appLaunch = rows.find((r) => r.consentType === 'app_launch')

    // app_launch was active → now unsubscribed with resend_global_unsubscribe.
    expect(appLaunch?.unsubscribedAt).not.toBeNull()
    expect(appLaunch?.unsubscribeSource).toBe(UNSUBSCRIBE_SOURCE.globalUnsubscribe)

    // newsletter was already unsubscribed → its original source must NOT be overwritten.
    expect(newsletter?.unsubscribeSource).toBe('user_request')
  })
})
