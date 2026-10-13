import {PGlite} from '@electric-sql/pglite'
import * as gameSchema from '@whocards/game/db'
import {hostedGame} from '@whocards/game/db'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {appMember, appOrganization, appUser} from '~/server/db/schema'
import {createDrizzleHostStore} from './games-store'
import {readRecapState} from './games-logic'

const client = new PGlite()
const db = drizzle(client)
const store = createDrizzleHostStore(db)
let gameId = ''

const claim = (sentAt: number) => ({sentAt, sent: 0, failed: 0, error: null, pending: true})
const recapOf = async () => {
  const [row] = await db.select().from(hostedGame).where(eq(hostedGame.id, gameId))
  return readRecapState(row?.settings)
}

beforeAll(async () => {
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({...gameSchema, appUser, appOrganization, appMember})
  )
  for (const statement of statements) await client.exec(statement)
  const users = [
    ['u-avi', 'Avi', 'facilitator'],
    ['u-tamas', 'Tamas', 'facilitator'],
    ['u-boss', '', 'admin'],
    ['u-mem', 'Mem', 'member'],
  ] as const
  await db
    .insert(appUser)
    .values(users.map(([id, name]) => ({id, name, email: `${id}@example.com`})))
  await db
    .insert(appOrganization)
    .values({id: 'org', name: 'WhoCards', slug: 'whocards', createdAt: new Date()})
  await db.insert(appMember).values(
    users.map(([id, , role]) => ({
      id: `m-${id}`,
      organizationId: 'org',
      userId: id,
      role,
      createdAt: new Date(),
    }))
  )
}, 60_000)

beforeEach(async () => {
  await client.exec('TRUNCATE hosted_game CASCADE')
  gameId = (await store.createGame({title: 'SDD', organizer: 'SDD Conf', createdBy: 'u-avi'})).id
})

// The in-memory store in games.test.ts mirrors these rules; this pins the real SQL.
describe('drizzle host store conditional writes', () => {
  it('takes a draft live once, and never an ended game', async () => {
    expect(await Promise.all([store.goLive(gameId), store.goLive(gameId)])).toEqual([true, false])
    await store.endGame({gameId, endedAt: 1})
    expect(await store.goLive(gameId)).toBe(false)
  })

  it('lets one claim through, keeps settings, and reopens only a send that delivered nothing', async () => {
    expect(await store.claimRecap(gameId, claim(1))).toBe(false)
    await store.endGame({gameId, endedAt: 1})

    expect(
      await Promise.all([store.claimRecap(gameId, claim(2)), store.claimRecap(gameId, claim(3))])
    ).toEqual([true, false])
    expect(await store.claimRecap(gameId, claim(4))).toBe(false)

    await store.saveRecapState(gameId, {...claim(2), failed: 3, error: 'down', pending: false})
    expect(await store.claimRecap(gameId, claim(5))).toBe(true)
    await store.saveRecapState(gameId, {...claim(5), sent: 3, pending: false})
    expect(await store.claimRecap(gameId, claim(6))).toBe(false)

    expect(await recapOf()).toMatchObject({sentAt: 5, sent: 3, pending: false})
    const snapshot = await store.loadSnapshot(gameId)
    expect(snapshot?.game.settings).toMatchObject({round: {}, organizer: 'SDD Conf'})
  })

  it('edits details only until the game ends', async () => {
    expect(await store.updateGame({gameId, title: 'Main room', organizer: 'Acme'})).toBe('ok')
    expect((await store.loadSnapshot(gameId))?.game).toMatchObject({
      title: 'Main room',
      settings: {organizer: 'Acme'},
    })
    await store.endGame({gameId, endedAt: 1})
    expect(await store.updateGame({gameId, title: 'x', organizer: 'y'})).toBe('stale')
  })

  it('lists games by creator or co-facilitator, or all for admins, with host labels', async () => {
    await store.createGame({title: 'Other', organizer: 'X', createdBy: 'u-tamas'})
    const titles = async (userId: string | null) =>
      (await store.listGames(userId)).map((g) => g.title).toSorted()
    expect(await titles('u-avi')).toEqual(['SDD'])
    expect(await titles('u-boss')).toEqual([])
    expect(await titles(null)).toEqual(['Other', 'SDD'])

    await store.setFacilitator({gameId, userId: 'u-tamas', on: true})
    await store.setFacilitator({gameId, userId: 'u-boss', on: true})
    expect(await titles('u-tamas')).toEqual(['Other', 'SDD'])
    expect((await store.listGames('u-avi'))[0]).toMatchObject({
      createdBy: 'Avi',
      facilitators: ['Tamas', 'u-boss@example.com'],
    })
  })

  it('adds and removes co-facilitators without duplicates or touching other settings', async () => {
    await Promise.all([
      store.setFacilitator({gameId, userId: 'u-tamas', on: true}),
      store.setFacilitator({gameId, userId: 'u-boss', on: true}),
      store.setFacilitator({gameId, userId: 'u-tamas', on: true}),
    ])
    const hosts = await store.hostsOf(gameId)
    expect(hosts?.createdBy).toBe('u-avi')
    expect(hosts?.facilitators.toSorted()).toEqual(['u-boss', 'u-tamas'])
    await store.setFacilitator({gameId, userId: 'u-tamas', on: false})
    expect((await store.hostsOf(gameId))?.facilitators).toEqual(['u-boss'])
    expect((await store.loadSnapshot(gameId))?.game.settings).toMatchObject({organizer: 'SDD Conf'})
    expect(await store.hostsOf('00000000-0000-4000-8000-000000000999')).toBeNull()
  })

  it('offers org members at facilitator or above, and labels users by name or email', async () => {
    expect(await store.facilitatorsIn('org')).toEqual([
      {id: 'u-avi', label: 'Avi'},
      {id: 'u-tamas', label: 'Tamas'},
      {id: 'u-boss', label: 'u-boss@example.com'},
    ])
    expect(await store.facilitatorsIn('elsewhere')).toEqual([])
    expect(await store.usersByIds(['u-tamas', 'u-nobody', 'u-avi'])).toEqual([
      {id: 'u-tamas', label: 'Tamas'},
      {id: 'u-avi', label: 'Avi'},
    ])
  })
})
