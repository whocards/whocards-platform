import {drizzle} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import {drizzle as gameDrizzle} from '../../../../../packages/game/src/db/orm'
import {env} from '~/server/env'
import * as schema from './schema'

/**
 * Shared Supabase Postgres (same DB_URL as apps/website). This app owns only its
 * own additive tables (see schema.ts) — never touches website's `user`/`auth_*`/
 * `account_*`/etc tables (ADR-0008 / the overnight app-foundation plan guardrails).
 */
const client = postgres(env.DB_URL)
export const db = drizzle(client, {schema})
/** Same connection, typed by the drizzle-orm copy the game tables are built on. */
export const gameDb = gameDrizzle(client)

export {schema}
