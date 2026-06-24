import {sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
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
        appWaitlist: sql`${schema.users.appWaitlist} OR excluded.app_waitlist`,
      },
    })
    .returning()
    .then((rows) => rows[0])
