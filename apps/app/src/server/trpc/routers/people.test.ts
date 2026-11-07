import {PGlite} from '@electric-sql/pglite'
import {eq} from 'drizzle-orm'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, describe, expect, it, vi} from 'vitest'

import * as schema from '~/server/db/schema'
import {createCallerFactory} from '../trpc'

const client = new PGlite()
const db = drizzle(client, {schema})
vi.mock('../../db', () => ({db}))
vi.mock('@whocards/env/app', () => ({env: {OWNER_EMAIL: 'owner@example.com'}}))

const {addMember, peopleRouter} = await import('./people')

const admin = createCallerFactory(peopleRouter)({
  user: {id: 'u-admin', email: 'admin@example.com', name: 'Admin'},
  membership: {organizationId: 'org', role: 'admin'},
})

const languageOf = async (userId: string) =>
  (
    await db
      .select({role: schema.appMember.role, language: schema.appMember.language})
      .from(schema.appMember)
      .where(eq(schema.appMember.userId, userId))
  )[0]

beforeAll(async () => {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  for (const statement of statements) await client.exec(statement)
}, 60_000)

describe('people', () => {
  it('can never invite or promote anyone to translator', async () => {
    const member = await addMember({email: 'staff@example.com', role: 'member'})
    // @ts-expect-error translator is not a People role
    await expect(admin.invite({email: 'x@example.com', role: 'translator'})).rejects.toThrow(
      'Invalid option'
    )
    // @ts-expect-error translator is not a People role
    await expect(admin.updateRole({userId: member!.userId, role: 'translator'})).rejects.toThrow(
      'Invalid option'
    )
    expect(await languageOf(member!.userId)).toEqual({role: 'member', language: null})
  })

  it("keeps a translator's language through a re-invite and a role change", async () => {
    const translator = await addMember({
      email: 'tr@example.com',
      role: 'translator',
      language: 'id',
    })
    await admin.invite({email: 'tr@example.com', role: 'reviewer'})
    expect(await languageOf(translator!.userId)).toEqual({role: 'reviewer', language: 'id'})
    await admin.updateRole({userId: translator!.userId, role: 'member'})
    expect(await languageOf(translator!.userId)).toEqual({role: 'member', language: 'id'})
  })
})
