// Tests for Resend Contacts sync (#120).
//
// All Resend interaction is mocked — no network calls.
// DB assertions use PGlite (same pattern as upsert.test.ts).

import {PGlite} from '@electric-sql/pglite'
import {eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import * as schema from './db/schema'
import {upsertConsent, upsertUser} from './db/upsert'
import {
  applyProviderSyncResult,
  makeSegmentIdResolver,
  needsSync,
  reconcile,
  syncConsentToResend,
  syncEmailConsents,
  type ResendContactsPort,
  type SyncDeps,
} from './resend-sync'

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
// Helpers to build fake ResendContactsPort
// ---------------------------------------------------------------------------

type CreateCall = Parameters<ResendContactsPort['create']>[0]
type GetCall = Parameters<ResendContactsPort['get']>[0]
type AddCall = Parameters<ResendContactsPort['addToSegment']>[0]

function makeFakeContacts(overrides: Partial<ResendContactsPort> = {}): ResendContactsPort & {
  createCalls: CreateCall[]
  getCalls: GetCall[]
  addCalls: AddCall[]
} {
  const createCalls: CreateCall[] = []
  const getCalls: GetCall[] = []
  const addCalls: AddCall[] = []

  return {
    createCalls,
    getCalls,
    addCalls,
    create: async (payload) => {
      createCalls.push(payload)
      return overrides.create ? overrides.create(payload) : {data: {id: 'contact-123'}, error: null}
    },
    get: async (options) => {
      getCalls.push(options)
      if (overrides.get) return overrides.get(options)
      const email = 'email' in options && options.email ? options.email : 'unknown@example.com'
      return {data: {id: 'contact-123', email}, error: null}
    },
    addToSegment: async (options) => {
      addCalls.push(options)
      return overrides.addToSegment
        ? overrides.addToSegment(options)
        : {data: {id: 'seg-member-1'}, error: null}
    },
  }
}

const silentLogger: SyncDeps['logger'] = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// ---------------------------------------------------------------------------
// 1. Segment resolution
// ---------------------------------------------------------------------------

describe('makeSegmentIdResolver', () => {
  it('returns the configured newsletter id', () => {
    const resolve = makeSegmentIdResolver('nl-abc', 'wl-def')
    expect(resolve('newsletter')).toBe('nl-abc')
  })

  it('returns the configured app_waitlist id', () => {
    const resolve = makeSegmentIdResolver('nl-abc', 'wl-def')
    expect(resolve('app_launch')).toBe('wl-def')
  })

  it('returns undefined when newsletter id not configured', () => {
    const resolve = makeSegmentIdResolver(undefined, 'wl-def')
    expect(resolve('newsletter')).toBeUndefined()
  })

  it('returns undefined when app_waitlist id not configured', () => {
    const resolve = makeSegmentIdResolver('nl-abc', undefined)
    expect(resolve('app_launch')).toBeUndefined()
  })

  it('skip path: syncConsentToResend returns skipped when segment unconfigured', async () => {
    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver(undefined, undefined),
      logger: silentLogger,
    }
    const result = await syncConsentToResend(
      {id: 1, email: 'a@b.com', name: null, consentType: 'newsletter'},
      deps
    )
    expect(result.status).toBe('skipped')
    expect(result).toMatchObject({status: 'skipped', reason: 'no_segment_configured'})
    // No Resend calls made.
    expect(fakeContacts.createCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Idempotent sync
// ---------------------------------------------------------------------------

describe('idempotent sync', () => {
  it('second sync converges to synced even when create returns "already_exists"', async () => {
    let callCount = 0
    const fakeContacts = makeFakeContacts({
      create: async (_payload) => {
        callCount++
        if (callCount === 1) {
          return {data: {id: 'contact-abc'}, error: null}
        }
        // Second call: contact already exists.
        return {
          data: null,
          error: {name: 'already_exists', message: 'Contact already exists'},
        }
      },
    })

    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }
    const consent = {id: 1, email: 'dup@example.com', name: 'Dup', consentType: 'newsletter'}

    const r1 = await syncConsentToResend(consent, deps)
    expect(r1.status).toBe('synced')
    expect(fakeContacts.createCalls).toHaveLength(1)
    expect(fakeContacts.getCalls).toHaveLength(0)

    const r2 = await syncConsentToResend(consent, deps)
    // Must converge to synced — not failed.
    expect(r2.status).toBe('synced')
    expect(fakeContacts.createCalls).toHaveLength(2)
    expect(fakeContacts.getCalls).toHaveLength(1)
    expect(fakeContacts.addCalls).toHaveLength(1)
    expect(fakeContacts.addCalls[0]!.segmentId).toBe('nl-seg-1')
  })

  it('converges when create returns a generic application_error containing "already exist"', async () => {
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'application_error', message: 'The contact already exists in this audience'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const result = await syncConsentToResend(
      {id: 1, email: 'exists@example.com', name: 'Existing', consentType: 'newsletter'},
      deps
    )
    // Falls through to get + addToSegment → synced.
    expect(result.status).toBe('synced')
    expect(fakeContacts.getCalls).toHaveLength(1)
    expect(fakeContacts.addCalls).toHaveLength(1)
  })

  it('converges when create returns an error with an unknown name (defensive fallthrough)', async () => {
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'unknown_error_code', message: 'Something went wrong'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const result = await syncConsentToResend(
      {id: 1, email: 'x@example.com', name: null, consentType: 'app_launch'},
      deps
    )
    // Falls through to get + addToSegment → synced.
    expect(result.status).toBe('synced')
    expect(fakeContacts.addCalls).toHaveLength(1)
    expect(fakeContacts.addCalls[0]!.segmentId).toBe('wl-seg-2')
  })

  it('surfaces failed only for definitely-fatal errors (auth failure)', async () => {
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'authentication_error', message: 'Invalid API key'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const result = await syncConsentToResend(
      {id: 1, email: 'x@example.com', name: null, consentType: 'newsletter'},
      deps
    )
    // Auth failure is fatal — do NOT fall through.
    expect(result.status).toBe('failed')
    expect(fakeContacts.getCalls).toHaveLength(0)
    expect(fakeContacts.addCalls).toHaveLength(0)
  })

  it('re-running sync after prior provider_sync_error converges and clears error in DB', async () => {
    // Insert consent row.
    const row = await upsertConsent(db, {
      email: 'retry@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    // Simulate a prior failed sync recorded in DB.
    await applyProviderSyncResult(db, row!.id, {status: 'failed', error: 'prior error'})

    // Now the second sync: create returns already_exists → falls through to segment add → synced.
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'already_exists', message: 'Contact already exists'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const summaries = await syncEmailConsents(db, 'retry@example.com', deps)
    expect(summaries[0]!.result.status).toBe('synced')

    // DB: provider_sync_error must be cleared.
    const [updated] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))
    expect(updated!.providerSyncError).toBeNull()
    expect(updated!.providerContactId).toBe('contact-123')
    expect(updated!.providerSyncedAt).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Dual-segment consent
// ---------------------------------------------------------------------------

describe('dual-segment consent', () => {
  it('email with both consent types is synced into both segment ids', async () => {
    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    await upsertConsent(db, {
      email: 'dual@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'dual@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const summaries = await syncEmailConsents(db, 'dual@example.com', deps)

    expect(summaries).toHaveLength(2)
    const synced = summaries.filter((s) => s.result.status === 'synced')
    expect(synced).toHaveLength(2)

    const segIds = fakeContacts.createCalls.flatMap((c) => (c.segments ?? []).map((s) => s.id))
    expect(segIds).toContain('nl-seg-1')
    expect(segIds).toContain('wl-seg-2')
  })

  it('re-run with already-exists on both: both still end in BOTH segments (idempotent)', async () => {
    // Both create calls return already_exists → falls through to segment-add for each.
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'already_exists', message: 'Contact already exists'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    await upsertConsent(db, {
      email: 'dual2@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'dual2@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const summaries = await syncEmailConsents(db, 'dual2@example.com', deps)
    expect(summaries).toHaveLength(2)
    const synced = summaries.filter((s) => s.result.status === 'synced')
    expect(synced).toHaveLength(2)

    // Both segments were targeted via addToSegment.
    const segIds = fakeContacts.addCalls.map((c) => c.segmentId)
    expect(segIds).toContain('nl-seg-1')
    expect(segIds).toContain('wl-seg-2')
  })
})

// ---------------------------------------------------------------------------
// 4. Provider failure → retry state
// ---------------------------------------------------------------------------

describe('provider failure → retry state', () => {
  it('failed sync sets provider_sync_error and leaves provider_synced_at null', async () => {
    const row = await upsertConsent(db, {
      email: 'fail@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })
    expect(row).toBeDefined()

    const failResult = {status: 'failed' as const, error: 'network timeout'}
    await applyProviderSyncResult(db, row!.id, failResult)

    const [updated] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))

    expect(updated!.providerSyncError).toBe('network timeout')
    expect(updated!.providerSyncedAt).toBeNull()
    expect(updated!.providerContactId).toBeNull()
  })

  it('successful sync after prior failure clears provider_sync_error', async () => {
    const row = await upsertConsent(db, {
      email: 'recover@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    await applyProviderSyncResult(db, row!.id, {status: 'failed', error: 'first failure'})
    await applyProviderSyncResult(db, row!.id, {
      status: 'synced',
      contactId: 'c-999',
      segmentId: 'seg-123',
    })

    const [updated] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))

    expect(updated!.providerSyncError).toBeNull()
    expect(updated!.providerContactId).toBe('c-999')
    expect(updated!.providerSegmentId).toBe('seg-123')
    expect(updated!.providerSyncedAt).not.toBeNull()
  })

  it('skipped result leaves DB row unchanged', async () => {
    const row = await upsertConsent(db, {
      email: 'skip@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    await applyProviderSyncResult(db, row!.id, {status: 'skipped', reason: 'no_segment_configured'})

    const [unchanged] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))

    expect(unchanged!.providerSyncError).toBeNull()
    expect(unchanged!.providerSyncedAt).toBeNull()
    expect(unchanged!.providerContactId).toBeNull()
  })

  it('syncEmailConsents records error in DB when create causes a fatal auth failure', async () => {
    const fakeContacts = makeFakeContacts({
      create: async () => ({
        data: null,
        error: {name: 'authentication_error', message: 'Invalid API key'},
      }),
    })
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    await upsertConsent(db, {
      email: 'err@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const summaries = await syncEmailConsents(db, 'err@example.com', deps)
    expect(summaries[0]!.result.status).toBe('failed')

    const rows = await db.select().from(schema.emailConsent)
    expect(rows[0]!.providerSyncError).toBe('Invalid API key')
    expect(rows[0]!.providerSyncedAt).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. needsSync helper
// ---------------------------------------------------------------------------

describe('needsSync', () => {
  it('returns true when providerSyncedAt is null', () => {
    expect(
      needsSync({
        id: 1,
        email: 'x@y.com',
        name: null,
        consentType: 'newsletter',
        providerSyncedAt: null,
        providerSyncError: null,
      })
    ).toBe(true)
  })

  it('returns true when providerSyncError is set', () => {
    expect(
      needsSync({
        id: 1,
        email: 'x@y.com',
        name: null,
        consentType: 'newsletter',
        providerSyncedAt: '2026-01-01T00:00:00Z',
        providerSyncError: 'some error',
      })
    ).toBe(true)
  })

  it('returns false when already synced with no error', () => {
    expect(
      needsSync({
        id: 1,
        email: 'x@y.com',
        name: null,
        consentType: 'newsletter',
        providerSyncedAt: '2026-01-01T00:00:00Z',
        providerSyncError: null,
      })
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. reconcile() — dry-run and apply modes (FIX 4)
// ---------------------------------------------------------------------------

/**
 * Shared upsertConsentFn for reconcile() tests — mirrors what the script does.
 */
function makeUpsertConsentFn(database: PgDatabase<PgQueryResultHKT, typeof schema>) {
  return async (
    _db: PgDatabase<PgQueryResultHKT, typeof schema>,
    {email, name, userId}: {email: string; name: string; userId: number}
  ) => {
    return upsertConsent(database, {
      email,
      name,
      userId,
      consentType: 'newsletter',
      consentSource: 'legacy_user_newsletter',
    })
  }
}

describe('reconcile() — dry-run', () => {
  it('makes ZERO Resend create/add calls and ZERO provider-column DB writes', async () => {
    // Insert two consent rows that need sync (provider_synced_at IS NULL).
    await upsertConsent(db, {
      email: 'a@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })
    await upsertConsent(db, {
      email: 'b@example.com',
      consentType: 'app_launch',
      consentSource: 'app_page',
    })

    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const counts = await reconcile({
      db,
      deps,
      apply: false,
      upsertConsentFn: makeUpsertConsentFn(db),
    })

    // No Resend calls.
    expect(fakeContacts.createCalls).toHaveLength(0)
    expect(fakeContacts.addCalls).toHaveLength(0)
    expect(fakeContacts.getCalls).toHaveLength(0)

    // No provider-column DB writes.
    const rows = await db.select().from(schema.emailConsent)
    for (const row of rows) {
      expect(row.providerSyncedAt).toBeNull()
      expect(row.providerContactId).toBeNull()
      expect(row.providerSyncError).toBeNull()
    }

    // Counts: 2 scanned, 2 wouldSync (both have configured segments).
    expect(counts.scanned).toBe(2)
    expect(counts.wouldSync).toBe(2)
    expect(counts.synced).toBe(0)
  })

  it('counts as skipped rows whose consent type has no segment configured', async () => {
    await upsertConsent(db, {
      email: 'c@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      // newsletter NOT configured → should count as skipped
      segmentIdFor: makeSegmentIdResolver(undefined, 'wl-seg-2'),
      logger: silentLogger,
    }

    const counts = await reconcile({
      db,
      deps,
      apply: false,
      upsertConsentFn: makeUpsertConsentFn(db),
    })

    expect(counts.wouldSync).toBe(0)
    expect(counts.skipped).toBe(1)
    expect(fakeContacts.createCalls).toHaveLength(0)
  })
})

describe('reconcile() — apply mode', () => {
  it('performs create/add calls and writes provider columns to DB', async () => {
    const row = await upsertConsent(db, {
      email: 'sync@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
    })

    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const counts = await reconcile({
      db,
      deps,
      apply: true,
      upsertConsentFn: makeUpsertConsentFn(db),
    })

    expect(counts.synced).toBe(1)
    expect(counts.wouldSync).toBe(0)

    // Resend create was called once.
    expect(fakeContacts.createCalls).toHaveLength(1)

    // DB: provider columns written.
    const [updated] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))
    expect(updated!.providerContactId).toBe('contact-123')
    expect(updated!.providerSegmentId).toBe('nl-seg-1')
    expect(updated!.providerSyncedAt).not.toBeNull()
    expect(updated!.providerSyncError).toBeNull()
  })

  it('backfills legacy newsletter user consent then syncs it', async () => {
    // Insert a legacy user with newsletter=true but no consent row.
    await upsertUser(db, {email: 'legacy@example.com', name: 'Legacy', newsletter: true})

    const fakeContacts = makeFakeContacts()
    const deps: SyncDeps = {
      resendContacts: fakeContacts,
      segmentIdFor: makeSegmentIdResolver('nl-seg-1', 'wl-seg-2'),
      logger: silentLogger,
    }

    const counts = await reconcile({
      db,
      deps,
      apply: true,
      upsertConsentFn: makeUpsertConsentFn(db),
    })

    // No existing needsSync rows, but legacy backfill ran and synced.
    expect(counts.synced).toBe(1)

    // A newsletter consent row was created and synced.
    const rows = await db.select().from(schema.emailConsent)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.consentSource).toBe('legacy_user_newsletter')
    expect(rows[0]!.providerContactId).toBe('contact-123')
  })
})

// ---------------------------------------------------------------------------
// 7. applyProviderSyncResult — synced writes all provider columns
// ---------------------------------------------------------------------------

describe('applyProviderSyncResult — synced', () => {
  it('writes contactId, segmentId, syncedAt and clears error', async () => {
    const user = await upsertUser(db, {email: 'ok@example.com', name: 'OK', newsletter: false})
    const row = await upsertConsent(db, {
      email: 'ok@example.com',
      consentType: 'newsletter',
      consentSource: 'app_page',
      userId: user!.id,
    })

    await applyProviderSyncResult(db, row!.id, {
      status: 'synced',
      contactId: 'c-abc-123',
      segmentId: 'seg-xyz',
    })

    const [updated] = await db
      .select()
      .from(schema.emailConsent)
      .where(eq(schema.emailConsent.id, row!.id))

    expect(updated!.providerContactId).toBe('c-abc-123')
    expect(updated!.providerSegmentId).toBe('seg-xyz')
    expect(updated!.providerSyncedAt).not.toBeNull()
    expect(updated!.providerSyncError).toBeNull()
  })
})
