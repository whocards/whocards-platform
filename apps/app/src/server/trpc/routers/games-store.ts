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

import {and, asc, count, desc, eq, inArray, isNull, ne, or, sql} from 'drizzle-orm'
import type {SQL} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'

import {ROLE_RANK} from '~/server/auth/permissions'
import {appMember, appUser} from '~/server/db/schema'
import type {HostStore, HostUser, WriteResult} from './games'
import {closingTimes, readFacilitators} from './games-logic'

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

const mergeSettings = (patch: Record<string, unknown>) =>
  sql`${hostedGame.settings} || ${JSON.stringify(patch)}::jsonb`

const userLabel = sql<string>`coalesce(nullif(${appUser.name}, ''), ${appUser.email})`

const HOST_ROLES = ROLE_RANK.slice(ROLE_RANK.indexOf('facilitator'))

const usersByIds = async (db: Db, ids: string[]): Promise<HostUser[]> => {
  if (ids.length === 0) return []
  const rows = await db
    .select({id: appUser.id, label: userLabel})
    .from(appUser)
    .where(inArray(appUser.id, ids))
  return ids.flatMap((id) => rows.filter((r) => r.id === id))
}

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
  questionPlan: row.questionPlan,
  turnSeconds: row.turnSeconds,
  oddRule: row.oddRule,
  overtime: row.overtime,
  overtimeSeconds: row.overtimeSeconds,
  status: row.status,
  startedAt: ms(row.startedAt),
  endsAt: ms(row.endsAt),
})

type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/** Ends the live round matching `which` and closes its open turns; false if none was live. */
const endLiveRound = async (tx: Db, which: SQL, endedAt: number): Promise<boolean> => {
  const [row] = await tx
    .update(gameRound)
    .set({status: 'done', endsAt: new Date(endedAt)})
    .where(and(which, eq(gameRound.status, 'live')))
    .returning()
  if (!row) return false
  const open = await tx
    .select({id: gameTurn.id, startedAt: gameTurn.startedAt})
    .from(gameTurn)
    .innerJoin(gamePair, eq(gamePair.id, gameTurn.pairId))
    .where(and(eq(gamePair.roundId, row.id), isNull(gameTurn.finishedAt)))
  const turns = open.map((t) => ({id: t.id, startedAt: t.startedAt.getTime()}))
  for (const t of closingTimes(toRound(row), turns, endedAt)) {
    await tx
      .update(gameTurn)
      .set({finishedAt: new Date(t.finishedAt)})
      .where(and(eq(gameTurn.id, t.turnId), isNull(gameTurn.finishedAt)))
  }
  return true
}

const lockGame = async (tx: Db, gameId: string) => {
  const [game] = await tx
    .select({status: hostedGame.status})
    .from(hostedGame)
    .where(eq(hostedGame.id, gameId))
    .for('update')
  return game ?? null
}

/** Host-side writes over the game tables; mirrors apps/website's player port for reads. */
/** `db` is any Postgres drizzle instance: postgres-js in the app, PGlite in tests. */
export const createDrizzleHostStore = <
  T extends PgQueryResultHKT,
  S extends Record<string, unknown>,
>(
  db: PgDatabase<T, S>
): HostStore => ({
  now: Date.now,
  random: cryptoRandom,

  listGames: async (userId) => {
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
        createdBy: userLabel,
        players: sql<number>`coalesce(${players.n}, 0)`.mapWith(Number),
        rounds: sql<number>`coalesce(${rounds.n}, 0)`.mapWith(Number),
      })
      .from(hostedGame)
      .leftJoin(players, eq(players.gameId, hostedGame.id))
      .leftJoin(rounds, eq(rounds.gameId, hostedGame.id))
      .leftJoin(appUser, eq(appUser.id, hostedGame.createdBy))
      .where(
        userId === null
          ? undefined
          : or(
              eq(hostedGame.createdBy, userId),
              sql`${hostedGame.settings} -> 'facilitators' @> ${JSON.stringify([userId])}::jsonb`
            )
      )
      .orderBy(desc(hostedGame.createdAt))
    const users = await usersByIds(db, [
      ...new Set(rows.flatMap((r) => readFacilitators(r.game.settings))),
    ])
    const labelOf = new Map(users.map((u) => [u.id, u.label]))
    return rows.map((r) => ({
      id: r.game.id,
      code: r.game.code,
      title: r.game.title,
      organizer: r.game.settings.organizer ?? null,
      createdBy: r.createdBy,
      facilitators: readFacilitators(r.game.settings).flatMap((id) => labelOf.get(id) ?? []),
      status: r.game.status,
      createdAt: r.game.createdAt.getTime(),
      players: r.players,
      rounds: r.rounds,
    }))
  },

  createGame: async ({title, organizer, createdBy}) => {
    // Codes are short, so collide now and then; the unique index decides.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const [row] = await db
          .insert(hostedGame)
          .values({
            title,
            createdBy,
            settings: {round: {}, organizer},
            code: makeCode(GAME_CODE_LENGTH, cryptoRandom),
          })
          .returning()
        if (row) return toGame(row)
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
    }
    throw new Error('Could not allocate a unique game code')
  },

  hostsOf: async (gameId) => {
    const [row] = await db
      .select({createdBy: hostedGame.createdBy, settings: hostedGame.settings})
      .from(hostedGame)
      .where(eq(hostedGame.id, gameId))
    return row ? {createdBy: row.createdBy, facilitators: readFacilitators(row.settings)} : null
  },

  usersByIds: (ids) => usersByIds(db, ids),

  facilitatorsIn: async (organizationId) => {
    const rows = await db
      .select({id: appUser.id, label: userLabel})
      .from(appMember)
      .innerJoin(appUser, eq(appUser.id, appMember.userId))
      .where(and(eq(appMember.organizationId, organizationId), inArray(appMember.role, HOST_ROLES)))
    return rows.toSorted((a, b) => a.label.localeCompare(b.label))
  },

  setFacilitator: async ({gameId, userId, on}) => {
    // Remove-then-append in one statement, so concurrent edits never drop or duplicate an id.
    const without = sql`coalesce(${hostedGame.settings} -> 'facilitators', '[]'::jsonb) - ${userId}::text`
    const list = on ? sql`${without} || to_jsonb(${userId}::text)` : without
    await db
      .update(hostedGame)
      .set({settings: sql`${hostedGame.settings} || jsonb_build_object('facilitators', ${list})`})
      .where(eq(hostedGame.id, gameId))
  },

  updateGame: ({gameId, title, organizer}) =>
    settle(async () => {
      const rows = await db
        .update(hostedGame)
        .set({title, settings: mergeSettings({organizer})})
        .where(and(eq(hostedGame.id, gameId), ne(hostedGame.status, 'ended')))
        .returning({id: hostedGame.id})
      if (rows.length === 0) throw new StaleWrite()
    }),

  goLive: async (gameId) => {
    const rows = await db
      .update(hostedGame)
      .set({status: 'live'})
      .where(and(eq(hostedGame.id, gameId), eq(hostedGame.status, 'lobby')))
      .returning({id: hostedGame.id})
    return rows.length > 0
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
          roundId: gamePair.roundId,
          playerId: gameTurn.playerId,
          questionId: gameTurn.questionId,
          startedAt: gameTurn.startedAt,
          finishedAt: gameTurn.finishedAt,
          questionVote: gameTurn.questionVote,
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
        // Same game lock as endGame, so a round can't go live in a game that is ending.
        const game = await lockGame(tx, gameId)
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

  endRound: ({roundId, endedAt}) =>
    settle(() =>
      db.transaction(async (tx) => {
        if (!(await endLiveRound(tx, eq(gameRound.id, roundId), endedAt))) throw new StaleWrite()
      })
    ),

  endGame: ({gameId, endedAt}) =>
    db.transaction(async (tx) => {
      const game = await lockGame(tx, gameId)
      if (!game || game.status === 'ended') return
      await endLiveRound(tx, eq(gameRound.gameId, gameId), endedAt)
      await tx.update(hostedGame).set({status: 'ended'}).where(eq(hostedGame.id, gameId))
    }),

  claimRecap: async (gameId, claim) => {
    const rows = await db
      .update(hostedGame)
      .set({settings: mergeSettings({recap: claim})})
      .where(
        and(
          eq(hostedGame.id, gameId),
          eq(hostedGame.status, 'ended'),
          // Unclaimed, or a finished send where nothing went out: retrying can't double-send.
          sql`(${hostedGame.settings} -> 'recap' is null or (
            coalesce((${hostedGame.settings} -> 'recap' ->> 'pending')::boolean, false) = false
            and (${hostedGame.settings} -> 'recap' ->> 'sent')::int = 0
          ))`
        )
      )
      .returning({id: hostedGame.id})
    return rows.length > 0
  },

  saveRecapState: async (gameId, recap) => {
    await db
      .update(hostedGame)
      .set({settings: mergeSettings({recap})})
      .where(eq(hostedGame.id, gameId))
  },

  setAnswerMode: ({gameId, mode}) =>
    settle(async () => {
      // The database clock also stamps turn starts (website drizzle-port), so the two compare without skew.
      const at = sql`floor(extract(epoch from now()) * 1000)::bigint`
      const entry = sql`jsonb_build_array(jsonb_build_object('mode', ${mode}::text, 'at', ${at}))`
      const log = sql`coalesce(${hostedGame.settings} -> 'answerModes', '[]'::jsonb) || ${entry}`
      const rows = await db
        .update(hostedGame)
        .set({settings: sql`${hostedGame.settings} || jsonb_build_object('answerModes', ${log})`})
        .where(and(eq(hostedGame.id, gameId), ne(hostedGame.status, 'ended')))
        .returning({id: hostedGame.id})
      if (rows.length === 0) throw new StaleWrite()
    }),

  ensureStandbyKey: async (gameId, key) => {
    const kept = sql`coalesce(${hostedGame.settings} -> 'standbyKey', to_jsonb(${key}::text))`
    await db
      .update(hostedGame)
      .set({settings: sql`${hostedGame.settings} || jsonb_build_object('standbyKey', ${kept})`})
      .where(eq(hostedGame.id, gameId))
  },

  saveQuestions: async (gameId, questions) => {
    await db
      .update(hostedGame)
      .set({settings: mergeSettings({questions})})
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
