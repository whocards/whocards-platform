import {sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import type {ConsentType} from '~server/consent'
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
) =>
  database
    .insert(schema.users)
    .values(user)
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: user.name,
        email: user.email,
        newsletter: sql`${schema.users.newsletter} OR excluded.newsletter`,
      },
    })
    .returning()
    .then((rows) => rows[0])

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
//   - Does NOT overwrite consentedAt (preserves first-consent timestamp).
//   - Does NOT touch fulfilledAt or provider_* fields.
export const upsertConsent = <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  consent: ConsentCreate
) =>
  database
    .insert(schema.emailConsent)
    .values({
      email: consent.email,
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
        updatedAt: sql`now()`,
      },
    })
    .returning()
    .then((rows) => rows[0])
