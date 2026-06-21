import {drizzle} from 'drizzle-orm/postgres-js'
import {createInsertSchema} from 'drizzle-zod'
import postgres from 'postgres'
import {env} from '~env-secrets'
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
export const insertUser = (user: UserCreate) =>
  db
    .insert(schema.users)
    .values(user)
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: user.name,
        newsletter: user.newsletter,
        email: user.email,
      },
    })
    .returning()
    .then((rows) => rows[0])
