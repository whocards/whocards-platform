import {randomBytes} from 'node:crypto'

import {makeCode} from '@whocards/game'
import type {GameSnapshot, HostedGame, Player, Round} from '@whocards/game'
import {
  gamePair,
  gamePairPlayer,
  gamePlayer,
  gameResponse,
  gameRound,
  gameTurn,
  hostedGame,
} from '@whocards/game/db'

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from '../../../../../../packages/game/src/db/orm'
import type {PostgresJsDatabase} from '../../../../../../packages/game/src/db/orm'
import type {HostStore, WriteResult} from './games'

const GAME_CODE_LENGTH = 5

const cryptoRandom = () => randomBytes(4).readUInt32BE() / 2 ** 32

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

// drizzle wraps driver errors in DrizzleQueryError, so the Postgres code may sit on `cause`.
const isUniqueViolation = (error: unknown): boolean =>
  errorCode(error) === '23505' || (error instanceof Error && errorCode(error.cause) === '23505')

class StaleWrite extends Error {}

const settle = async (write: () => Promise<unknown>): Promise<WriteResult> => {
  try {
    await write()
    return 'ok'
  } catch (error) {
    if (error instanceof StaleWrite) return 'stale'
    if (isUniqueViolation(error)) return 'conflict'
    throw error
  }
}

const ms = (date: Date | null) => (date ? date.getTime() : null)

const toGame = (row: typeof hostedGame.$inferSelect): HostedGame => ({
  id: row.id,
  code: row.code,
  title: row.title,
  status: row.status,
  settings: row.settings,
})

const toPlayer = (row: typeof gamePlayer.$inferSelect): Player => ({
  id: row.id,
  gameId: row.gameId,
  name: row.name,
  language: row.language,
  pairCode: row.pairCode,
  email: row.email,
  consentTranscript: row.consentTranscript,
  consentRecap: row.consentRecap,
})

const toRound = (row: typeof gameRound.$inferSelect): Round => ({
  id: row.id,
  gameId: row.gameId,
  n: row.n,
  deckSlug: row.deckSlug,
  turnSeconds: row.turnSeconds,
  oddRule: row.oddRule,
  overtime: row.overtime,
  overtimeSeconds: row.overtimeSeconds,
  status: row.status,
  startedAt: ms(row.startedAt),
  endsAt: ms(row.endsAt),
})

/** Host-side writes over the game tables; mirrors apps/website's player port for reads. */
export const createDrizzleHostStore = (db: PostgresJsDatabase): HostStore => ({
  now: Date.now,
  random: cryptoRandom,

  listGames: async (createdBy) => {
    const players = db
      .select({gameId: gamePlayer.gameId, n: count().as('players')})
      .from(gamePlayer)
      .groupBy(gamePlayer.gameId)
      .as('players')
    const rounds = db
      .select({gameId: gameRound.gameId, n: count().as('rounds')})
      .from(gameRound)
      .groupBy(gameRound.gameId)
      .as('rounds')
    const rows = await db
      .select({
        game: hostedGame,
        players: sql<number>`coalesce(${players.n}, 0)`.mapWith(Number),
        rounds: sql<number>`coalesce(${rounds.n}, 0)`.mapWith(Number),
      })
      .from(hostedGame)
      .leftJoin(players, eq(players.gameId, hostedGame.id))
      .leftJoin(rounds, eq(rounds.gameId, hostedGame.id))
      .where(eq(hostedGame.createdBy, createdBy))
      .orderBy(desc(hostedGame.createdAt))
    return rows.map((r) => ({
      id: r.game.id,
      code: r.game.code,
      title: r.game.title,
      status: r.game.status,
      createdAt: r.game.createdAt.getTime(),
      players: r.players,
      rounds: r.rounds,
    }))
  },

  createGame: async ({title, createdBy}) => {
    // Codes are short, so collide now and then; the unique index decides.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const [row] = await db
          .insert(hostedGame)
          .values({title, createdBy, code: makeCode(GAME_CODE_LENGTH, cryptoRandom)})
          .returning()
        if (row) return toGame(row)
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
    }
    throw new Error('Could not allocate a unique game code')
  },

  loadSnapshot: async (gameId) => {
    const [game] = await db.select().from(hostedGame).where(eq(hostedGame.id, gameId))
    if (!game) return null
    const [players, rounds, members, turns] = await Promise.all([
      db
        .select()
        .from(gamePlayer)
        .where(eq(gamePlayer.gameId, gameId))
        .orderBy(asc(gamePlayer.createdAt)),
      db.select().from(gameRound).where(eq(gameRound.gameId, gameId)).orderBy(asc(gameRound.n)),
      db
        .select({
          pairId: gamePairPlayer.pairId,
          roundId: gamePairPlayer.roundId,
          playerId: gamePairPlayer.playerId,
        })
        .from(gamePairPlayer)
        .innerJoin(gameRound, eq(gameRound.id, gamePairPlayer.roundId))
        .where(eq(gameRound.gameId, gameId))
        .orderBy(asc(gamePairPlayer.slot)),
      db
        .select({
          id: gameTurn.id,
          pairId: gameTurn.pairId,
          playerId: gameTurn.playerId,
          questionId: gameTurn.questionId,
          startedAt: gameTurn.startedAt,
          finishedAt: gameTurn.finishedAt,
        })
        .from(gameTurn)
        .innerJoin(gamePair, eq(gamePair.id, gameTurn.pairId))
        .innerJoin(gameRound, eq(gameRound.id, gamePair.roundId))
        .where(eq(gameRound.gameId, gameId))
        .orderBy(asc(gameTurn.startedAt)),
    ])

    const pairs = new Map<string, {id: string; roundId: string; playerIds: string[]}>()
    for (const m of members) {
      const pair = pairs.get(m.pairId) ?? {id: m.pairId, roundId: m.roundId, playerIds: []}
      pair.playerIds.push(m.playerId)
      pairs.set(m.pairId, pair)
    }

    const snapshot: GameSnapshot = {
      game: toGame(game),
      players: players.map(toPlayer),
      rounds: rounds.map(toRound),
      pairs: [...pairs.values()],
      turns: turns.map((t) => ({
        ...t,
        startedAt: t.startedAt.getTime(),
        finishedAt: ms(t.finishedAt),
      })),
    }
    return snapshot
  },

  savedResponses: async (gameId) => {
    const rows = await db
      .select({playerId: gameResponse.playerId, n: count()})
      .from(gameResponse)
      .innerJoin(gamePlayer, eq(gamePlayer.id, gameResponse.playerId))
      .where(and(eq(gamePlayer.gameId, gameId), isNull(gameResponse.deletedAt)))
      .groupBy(gameResponse.playerId)
    return Object.fromEntries(rows.map((r) => [r.playerId, r.n]))
  },

  addRound: (input) => settle(() => db.insert(gameRound).values(input)),

  updateRound: ({roundId, whileStatus, settings}) =>
    settle(async () => {
      const rows = await db
        .update(gameRound)
        .set(settings)
        .where(and(eq(gameRound.id, roundId), eq(gameRound.status, whileStatus)))
        .returning({id: gameRound.id})
      if (rows.length === 0) throw new StaleWrite()
    }),

  startRound: ({gameId, roundId, startedAt, endsAt}) =>
    settle(() =>
      db.transaction(async (tx) => {
        await tx
          .update(hostedGame)
          .set({status: 'live'})
          .where(and(eq(hostedGame.id, gameId), eq(hostedGame.status, 'lobby')))
        const [game] = await tx
          .select({status: hostedGame.status})
          .from(hostedGame)
          .where(eq(hostedGame.id, gameId))
        if (game?.status !== 'live') throw new StaleWrite()
        const rows = await tx
          .update(gameRound)
          .set({status: 'live', startedAt: new Date(startedAt), endsAt: new Date(endsAt)})
          .where(
            and(
              eq(gameRound.id, roundId),
              eq(gameRound.gameId, gameId),
              eq(gameRound.status, 'pending')
            )
          )
          .returning({id: gameRound.id})
        if (rows.length === 0) throw new StaleWrite()
      })
    ),

  endRound: ({roundId, endedAt, closeTurns}) =>
    settle(() =>
      db.transaction(async (tx) => {
        const rows = await tx
          .update(gameRound)
          .set({status: 'done', endsAt: new Date(endedAt)})
          .where(and(eq(gameRound.id, roundId), eq(gameRound.status, 'live')))
          .returning({id: gameRound.id})
        if (rows.length === 0) throw new StaleWrite()
        for (const t of closeTurns) {
          await tx
            .update(gameTurn)
            .set({finishedAt: new Date(t.finishedAt)})
            .where(and(eq(gameTurn.id, t.turnId), isNull(gameTurn.finishedAt)))
        }
      })
    ),

  endGame: async (gameId) => {
    const rows = await db
      .update(hostedGame)
      .set({status: 'ended'})
      .where(and(eq(hostedGame.id, gameId), ne(hostedGame.status, 'ended')))
      .returning({id: hostedGame.id})
    return rows.length > 0
  },

  saveRecapState: async (gameId, recap) => {
    await db
      .update(hostedGame)
      .set({settings: sql`${hostedGame.settings} || ${JSON.stringify({recap})}::jsonb`})
      .where(eq(hostedGame.id, gameId))
  },

  removePlayer: ({gameId, playerId, release}) =>
    db.transaction(async (tx) => {
      if (release && release.playerIds.length > 0) {
        await tx
          .delete(gamePairPlayer)
          .where(
            and(
              eq(gamePairPlayer.pairId, release.pairId),
              inArray(gamePairPlayer.playerId, release.playerIds)
            )
          )
      }
      const rows = await tx
        .delete(gamePlayer)
        .where(and(eq(gamePlayer.id, playerId), eq(gamePlayer.gameId, gameId)))
        .returning({id: gamePlayer.id})
      return rows.length > 0
    }),
})
