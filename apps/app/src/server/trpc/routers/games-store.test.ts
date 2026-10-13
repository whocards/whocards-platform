import {PGlite} from '@electric-sql/pglite'
import * as gameSchema from '@whocards/game/db'
import {hostedGame} from '@whocards/game/db'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {appUser} from '~/server/db/schema'
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
    generateDrizzleJson({...gameSchema, appUser})
  )
  for (const statement of statements) await client.exec(statement)
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

  it('lists every game with its creator name', async () => {
    await db.insert(appUser).values({id: 'u-avi', name: 'Avi', email: 'avi@example.com'})
    const [game] = await store.listGames()
    expect(game).toMatchObject({title: 'SDD', organizer: 'SDD Conf', createdBy: 'Avi'})
    expect(await store.creatorOf(gameId)).toBe('Avi')
  })
})
