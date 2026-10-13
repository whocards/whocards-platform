import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

/** Shared Supabase Postgres: apps/website and apps/app read the same database. */
export const dbSchema = {
  DB_URL: z.string().min(1),
}

/** For tooling (drizzle-kit) that needs the database and nothing else. */
export const dbEnv = createEnv({
  server: dbSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
