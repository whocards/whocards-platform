import {sql} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/postgres-js'
import {createInsertSchema} from 'drizzle-zod'
import postgres from 'postgres'
import {env} from '~env'
import * as schemas from './schema'

const client = postgres(env.DB_URL)
export const db = drizzle(client, {schema: schemas})

const {users} = schemas

// types
export type UserCreate = typeof users.$inferInsert
export type UserSelect = typeof users.$inferSelect

// schemas
export const schema = {...schemas}
export const insertUserSchema = createInsertSchema(users)

// queries
//
// Consent is never erased on conflict: `newsletter` and `app_waitlist` are
// OR-merged with the incoming row, so a later form that arrives with a consent
// unchecked (or omitted) cannot downgrade an existing positive consent (#87).
// Opting out is a deliberate, separate action (signed unsubscribe), not a
// side effect of resubmitting an unrelated form.
export const insertUser = (user: UserCreate) =>
  db
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
