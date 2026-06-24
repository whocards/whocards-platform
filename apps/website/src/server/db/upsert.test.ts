import {PGlite} from '@electric-sql/pglite'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeEach, describe, expect, it} from 'vitest'
import * as schema from './schema'
import {upsertUser} from './upsert'

// Exercises the real ON CONFLICT OR-merge SQL against an in-process Postgres
// (pglite) — the pure-TS consent tests in app-waitlist.test.ts can't catch a
// wrong SQL expression. Only the `user` table is created; that's all upsertUser
// touches.
let db: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  const client = new PGlite()
  db = drizzle(client, {schema})
  await client.exec(`
    CREATE TABLE "user" (
      "id" serial PRIMARY KEY,
      "email" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "newsletter" boolean DEFAULT false NOT NULL,
      "app_waitlist" boolean DEFAULT false NOT NULL,
      "oc_slug" text
    );
  `)
})

describe('upsertUser — non-destructive consent merge (#87)', () => {
  it('first signup stores the two consents independently', async () => {
    const row = await upsertUser(db, {
      email: 'a@b.com',
      name: 'A',
      newsletter: false,
      appWaitlist: true,
    })
    expect(row.newsletter).toBe(false)
    expect(row.appWaitlist).toBe(true)
  })

  it('a later waitlist signup (newsletter unchecked) does not erase newsletter consent', async () => {
    await upsertUser(db, {email: 'a@b.com', name: 'A', newsletter: true, appWaitlist: false})
    const row = await upsertUser(db, {
      email: 'a@b.com',
      name: 'A renamed',
      newsletter: false, // box unchecked this time
      appWaitlist: true,
    })
    expect(row.newsletter).toBe(true) // preserved, not downgraded
    expect(row.appWaitlist).toBe(true) // newly granted
    expect(row.name).toBe('A renamed') // name still updates
  })

  it('a later newsletter opt-in adds newsletter without dropping app consent', async () => {
    await upsertUser(db, {email: 'c@d.com', name: 'C', newsletter: false, appWaitlist: true})
    const row = await upsertUser(db, {
      email: 'c@d.com',
      name: 'C',
      newsletter: true,
      appWaitlist: false,
    })
    expect(row.newsletter).toBe(true)
    expect(row.appWaitlist).toBe(true)
  })
})
