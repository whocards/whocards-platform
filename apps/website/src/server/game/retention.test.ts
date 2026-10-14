import {PGlite} from '@electric-sql/pglite'
import * as gameSchema from '@whocards/game/db'
import {
  gamePair,
  gamePlayer,
  gameResponse,
  gameRound,
  gameTurn,
  hostedGame,
} from '@whocards/game/db'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {asc} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {findExpiredGames, purgeGames} from './retention'

const client = new PGlite()
const db = drizzle(client)
const now = new Date('2027-01-13T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

beforeAll(async () => {
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({...gameSchema})
  )
  for (const statement of statements) await client.exec(statement)
})

beforeEach(async () => {
  await client.exec('TRUNCATE hosted_game CASCADE')
})

const seedGame = async (code: string, created: Date, roundEnds: Date | null) => {
  const [game] = await db
    .insert(hostedGame)
    .values({code, title: code, status: 'ended', createdAt: created})
    .returning()
  const gameId = game?.id ?? ''
  if (!roundEnds) return gameId
  const [round] = await db
    .insert(gameRound)
    .values({gameId, n: 1, deckSlug: 'library', turnSeconds: 60, status: 'done', endsAt: roundEnds})
    .returning()
  const [pair] = await db
    .insert(gamePair)
    .values({roundId: round?.id ?? ''})
    .returning()
  const players = await db
    .insert(gamePlayer)
    .values([
      {
        gameId,
        name: 'Ann',
        language: 'en',
        tokenHash: `${code}-a`,
        pairCode: 'AAAA',
        email: 'a@x.io',
      },
      {gameId, name: 'Bo', language: 'en', tokenHash: `${code}-b`, pairCode: 'BBBB'},
    ])
    .returning()
  for (const player of players) {
    const [turn] = await db
      .insert(gameTurn)
      .values({
        pairId: pair?.id ?? '',
        playerId: player.id,
        questionId: 'q',
        startedAt: roundEnds,
        finishedAt: roundEnds,
      })
      .returning()
    await db.insert(gameResponse).values({
      turnId: turn?.id ?? '',
      playerId: player.id,
      language: 'en',
      transcript: 'hi',
      durationMs: 1000,
    })
  }
  return gameId
}

describe('game retention', () => {
  it('selects only games whose last activity is over 90 days old', async () => {
    await seedGame('OLD', daysAgo(120), daysAgo(91))
    await seedGame('EDGE', daysAgo(120), daysAgo(89))
    await seedGame('NEW', daysAgo(10), daysAgo(10))
    await seedGame('EMPTY', daysAgo(200), null)

    const expired = await findExpiredGames(db, now)

    expect(expired.map(({code, responses, emails}) => ({code, responses, emails}))).toEqual([
      {code: 'OLD', responses: 2, emails: 1},
    ])
  })

  it('deletes responses and emails for purged games only', async () => {
    const old = await seedGame('OLD', daysAgo(120), daysAgo(91))
    await seedGame('NEW', daysAgo(10), daysAgo(10))

    await purgeGames(db, [old])

    expect(await findExpiredGames(db, now)).toEqual([])
    expect(await db.select({playerId: gameResponse.playerId}).from(gameResponse)).toHaveLength(2)
    const players = await db
      .select({code: gamePlayer.tokenHash, email: gamePlayer.email})
      .from(gamePlayer)
      .orderBy(asc(gamePlayer.tokenHash))
    expect(players).toEqual([
      {code: 'NEW-a', email: 'a@x.io'},
      {code: 'NEW-b', email: null},
      {code: 'OLD-a', email: null},
      {code: 'OLD-b', email: null},
    ])
  })
})
