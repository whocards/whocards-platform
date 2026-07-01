import {and, isNull, eq, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import {normalizeEmail, type ConsentType} from '../consent'
import * as schema from './schema'

export type UserCreate = typeof schema.users.$inferInsert

// Split out from index.ts (which opens a live Postgres client at import time) so the
// OR-merge can be exercised against an in-process Postgres in tests — see upsert.test.ts.
//
// Consent is never erased on conflict. In the `set` expressions below:
//   `${schema.users.newsletter}` is the EXISTING row's value, and
//   `excluded.newsletter` is the value PROPOSED by this insert.
// OR-merging them means an existing positive consent (`true`) survives regardless of
// the incoming value — a later form arriving with a box unchecked (or omitting the
// field) can never downgrade it. Opting out is a deliberate, separate action (#87).
export const upsertUser = <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  user: UserCreate
) => {
  // Normalize at the DB boundary so the (case-sensitive text) email key never
  // diverges across callers — the webhook normalizes lookups, so writes must too.
  const email = normalizeEmail(user.email)
  return database
    .insert(schema.users)
    .values({...user, email})
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: user.name,
        email,
        newsletter: sql`${schema.users.newsletter} OR excluded.newsletter`,
      },
    })
    .returning()
    .then((rows) => rows[0])
}

export type ConsentCreate = {
  email: string
  name?: string | null
  userId?: number | null
  consentType: ConsentType
  consentSource: string
}

// Upserts a consent row for a given (email, consentType) pair.
//
// On conflict (same email + consent_type):
//   - Updates name when a new value is provided.
//   - Coalesces userId so we never null an existing link.
//   - Clears unsubscribe fields on resubscribe.
//   - Resets provider sync state on resubscribe so reconciliation re-adds the
//     contact to Resend (a previously-synced-then-unsubscribed row would
//     otherwise look "already synced" and be skipped by needsSync()).
//   - Does NOT overwrite consentedAt (preserves first-consent timestamp).
//   - Does NOT touch fulfilledAt.
export const upsertConsent = <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  consent: ConsentCreate
) => {
  // Normalize at the DB boundary — keeps one row per logical (email, type).
  const email = normalizeEmail(consent.email)
  return database
    .insert(schema.emailConsent)
    .values({
      email,
      name: consent.name ?? null,
      userId: consent.userId ?? null,
      consentType: consent.consentType,
      consentSource: consent.consentSource,
    })
    .onConflictDoUpdate({
      target: [schema.emailConsent.email, schema.emailConsent.consentType],
      set: {
        name: sql`CASE WHEN excluded.name IS NOT NULL THEN excluded.name ELSE ${schema.emailConsent.name} END`,
        userId: sql`COALESCE(excluded.user_id, ${schema.emailConsent.userId})`,
        unsubscribedAt: null,
        unsubscribeSource: null,
        providerSyncedAt: null,
        providerSyncError: null,
        updatedAt: sql`now()`,
      },
    })
    .returning()
    .then((rows) => rows[0])
}

// ---------------------------------------------------------------------------
// Webhook unsubscribe helpers (#121)
// ---------------------------------------------------------------------------

/**
 * Set unsubscribed_at + unsubscribe_source on ALL currently-active consent rows
 * for the given email. Only touches rows where unsubscribed_at IS NULL so that
 * repeated webhook deliveries are idempotent (a second call affects 0 rows).
 * Returns the count of rows actually updated.
 */
export const unsubscribeAllActiveByEmail = async <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  {email, source}: {email: string; source: string}
): Promise<number> => {
  const {emailConsent} = schema
  const rows = await database
    .update(emailConsent)
    .set({
      unsubscribedAt: sql`now()`,
      unsubscribeSource: source,
      updatedAt: sql`now()`,
    })
    .where(and(eq(emailConsent.email, email), isNull(emailConsent.unsubscribedAt)))
    .returning({id: emailConsent.id})
  return rows.length
}

/**
 * Set unsubscribed_at + unsubscribe_source on the single active consent row
 * for the given (email, consentType) pair. Only touches rows where
 * unsubscribed_at IS NULL — idempotent on repeated delivery.
 * Returns the count of rows actually updated (0 or 1).
 */
export const unsubscribeByEmailAndType = async <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  {email, consentType, source}: {email: string; consentType: ConsentType; source: string}
): Promise<number> => {
  const {emailConsent} = schema
  const rows = await database
    .update(emailConsent)
    .set({
      unsubscribedAt: sql`now()`,
      unsubscribeSource: source,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(emailConsent.email, email),
        eq(emailConsent.consentType, consentType),
        isNull(emailConsent.unsubscribedAt)
      )
    )
    .returning({id: emailConsent.id})
  return rows.length
}
