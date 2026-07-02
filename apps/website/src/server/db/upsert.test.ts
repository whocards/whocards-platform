import {eq} from 'drizzle-orm'
import {beforeEach, describe, expect, it} from 'vitest'
import * as schema from './schema'
import {resetTestDb} from './test-helpers'
import type {TestDb} from './test-helpers'
import {upsertConsent, upsertUser} from './upsert'

// Exercises the real ON CONFLICT OR-merge SQL against an in-process Postgres
// (pglite) — the pure-TS consent tests in app-waitlist.test.ts can't catch a
// wrong SQL expression. One shared PGlite instance for the whole run, truncated
// between tests (see ./test-helpers).
let db: TestDb

beforeEach(async () => {
  db = await resetTestDb()
})

describe('upsertUser — non-destructive newsletter consent merge (#87)', () => {
  it('first signup stores newsletter independently', async () => {
    const row = await upsertUser(db, {
      email: 'a@b.com',
      name: 'A',
      newsletter: false,
    })
    expect(row.newsletter).toBe(false)
  })

  it('a later signup (newsletter unchecked) does not erase newsletter consent', async () => {
    await upsertUser(db, {email: 'a@b.com', name: 'A', newsletter: true})
    const row = await upsertUser(db, {
      email: 'a@b.com',
      name: 'A renamed',
      newsletter: false, // box unchecked this time
    })
    expect(row.newsletter).toBe(true) // preserved, not downgraded
    expect(row.name).toBe('A renamed') // name still updates
  })

  it('a later newsletter opt-in adds newsletter', async () => {
    await upsertUser(db, {email: 'c@d.com', name: 'C', newsletter: false})
    const row = await upsertUser(db, {
      email: 'c@d.com',
      name: 'C',
      newsletter: true,
    })
    expect(row.newsletter).toBe(true)
  })
})

describe('upsertConsent — email_consent table (#119)', () => {
  it('creates separate rows for separate consent types on the same email', async () => {
    await upsertConsent(db, {
      email: 'x@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'x@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    const rows = await db.select().from(schema.emailConsent)
    expect(rows).toHaveLength(2)
    const types = rows.map((r) => r.consentType).toSorted()
    expect(types).toEqual(['app_launch', 'newsletter'])
  })

  it('waitlist signup writes app_launch only — NO newsletter row when checkbox omitted', async () => {
    // Legally significant: joining the waitlist must NEVER imply newsletter consent.
    await upsertConsent(db, {
      email: 'waitlist-only@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    const rows = await db.select().from(schema.emailConsent)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.consentType).toBe('app_launch')
    const newsletterRows = rows.filter((r) => r.consentType === 'newsletter')
    expect(newsletterRows).toHaveLength(0)
  })

  it('unique(email, consent_type) — same email+type returns same row id', async () => {
    const first = await upsertConsent(db, {
      email: 'dup@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    const second = await upsertConsent(db, {
      email: 'dup@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    expect(second!.id).toBe(first!.id)
    const rows = await db.select().from(schema.emailConsent)
    expect(rows).toHaveLength(1)
  })

  it('preserves consentedAt on re-upsert', async () => {
    const first = await upsertConsent(db, {
      email: 'resub@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    // Seed a FIXED older consented_at so the assertion is deterministic — two
    // back-to-back now() defaults can collide and mask a wrongful overwrite.
    const fixedConsentedAt = '2024-01-01T00:00:00.000Z'
    await db
      .update(schema.emailConsent)
      .set({consentedAt: fixedConsentedAt})
      .where(eq(schema.emailConsent.id, first!.id))

    // Simulate a later re-signup
    const second = await upsertConsent(db, {
      email: 'resub@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    // consentedAt must be the original (seeded) timestamp, not overwritten
    expect(new Date(second!.consentedAt).toISOString()).toBe(fixedConsentedAt)
  })

  it('non-destructive resubscribe: clears unsubscribe fields and reuses same row', async () => {
    // Insert a row first
    const initial = await upsertConsent(db, {
      email: 'unsub@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    expect(initial).toBeDefined()

    // Simulate an unsubscribe AND a prior provider sync by directly updating the
    // row — a previously-synced row that later unsubscribed is the case that must
    // re-sync on resubscribe (otherwise needsSync() skips it forever).
    await db
      .update(schema.emailConsent)
      .set({
        unsubscribedAt: '2025-01-01T00:00:00Z',
        unsubscribeSource: 'user_request',
        providerSyncedAt: '2025-01-01T00:00:00Z',
        providerContactId: 'contact_123',
        providerSegmentId: 'seg_123',
      })
      .where(eq(schema.emailConsent.email, 'unsub@example.com'))

    const [unsubRow] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.email, 'unsub@example.com'))
    expect(unsubRow!.unsubscribedAt).not.toBeNull()
    expect(unsubRow!.unsubscribeSource).toBe('user_request')

    // Re-subscribe: upsertConsent should clear unsubscribe fields
    const resub = await upsertConsent(db, {
      email: 'unsub@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page_return',
    })
    // The row id should be the same (upsert, not a new insert)
    expect(resub!.id).toBe(initial!.id)
    // Unsubscribe fields are cleared
    expect(resub!.unsubscribedAt).toBeNull()
    expect(resub!.unsubscribeSource).toBeNull()
    // Provider sync state is reset so reconciliation re-adds the contact to Resend
    // (needsSync() keys off providerSyncedAt IS NULL). The contact id is kept.
    expect(resub!.providerSyncedAt).toBeNull()
    expect(resub!.providerSyncError).toBeNull()
  })

  it('links userId when provided, coalesces on re-upsert', async () => {
    const user = await upsertUser(db, {
      email: 'linked@example.com',
      name: 'Linked',
      newsletter: false,
    })
    const row = await upsertConsent(db, {
      email: 'linked@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
      userId: user!.id,
    })
    expect(row!.userId).toBe(user!.id)

    // Re-upsert without userId — should NOT null the existing link
    const row2 = await upsertConsent(db, {
      email: 'linked@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
      userId: null,
    })
    expect(row2!.userId).toBe(user!.id) // preserved
  })

  it('updates name when new value provided; keeps existing when null', async () => {
    await upsertConsent(db, {
      email: 'named@example.com',
      name: 'Original',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    const updated = await upsertConsent(db, {
      email: 'named@example.com',
      name: 'Updated',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    expect(updated!.name).toBe('Updated')

    // Now upsert with no name — should keep 'Updated'
    const kept = await upsertConsent(db, {
      email: 'named@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    expect(kept!.name).toBe('Updated')
  })
})
