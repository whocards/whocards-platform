import {drizzle} from 'drizzle-orm/postgres-js'
import {createInsertSchema} from 'drizzle-zod'
import postgres from 'postgres'
import {env} from '~env'
import * as schemas from './schema'
import {upsertConsent, upsertUser} from './upsert'
import type {ConsentCreate, UserCreate} from './upsert'

const client = postgres(env.DB_URL)
export const db = drizzle(client, {schema: schemas})

const {users} = schemas

// types
export type {ConsentCreate, UserCreate}
export type UserSelect = typeof users.$inferSelect

// schemas
export const schema = {...schemas}
export const insertUserSchema = createInsertSchema(users)

// queries — the non-destructive consent merge lives in ./upsert so it can be
// tested against an in-process Postgres without opening this module's live client.
export const insertUser = (user: UserCreate) => upsertUser(db, user)
export const insertConsent = (consent: ConsentCreate) => upsertConsent(db, consent)
