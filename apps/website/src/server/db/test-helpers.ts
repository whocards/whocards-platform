// Shared PGlite (in-process Postgres, compiled to WASM) test harness.
//
// PGlite's first instantiation pays a one-time cold WASM-compile cost (~10s on
// CI). Creating an instance per test — or even per file — repeated that cost and
// intermittently blew past vitest's default hookTimeout, failing whichever DB
// suite ran first with "Hook timed out in 10000ms".
//
// Instead we keep ONE instance for the entire run: this module is loaded a
// single time (vitest runs the suite in one worker with `isolate: false`), so
// the WASM compile and schema creation happen exactly once. Tests get isolation
// by truncating between cases — no per-file setup/teardown.

import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import * as schema from './schema'

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

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

let client: PGlite | undefined
let db: TestDb | undefined

/** Lazily create the single shared PGlite instance + schema (idempotent). */
async function getTestDb(): Promise<TestDb> {
  if (!db) {
    client = new PGlite()
    db = drizzle(client, {schema})
    await client.exec(CREATE_TABLES)
  }
  return db
}

/**
 * Reset the shared DB to a clean state and return it. Call from `beforeEach`.
 * Truncates with RESTART IDENTITY so serial ids start at 1 each test, matching
 * the per-test isolation the old `new PGlite()`-per-test setup provided.
 */
export async function resetTestDb(): Promise<TestDb> {
  const database = await getTestDb()
  if (!client) throw new Error('unreachable: getTestDb() always initializes client')
  await client.exec('TRUNCATE "email_consent", "user" RESTART IDENTITY CASCADE;')
  return database
}
