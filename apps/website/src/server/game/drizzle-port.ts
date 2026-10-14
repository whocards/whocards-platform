import {createHash, randomBytes} from 'node:crypto'
import type {GamePort, WriteResult} from '@whocards/api'
import {makeCode} from '@whocards/game'
import type {GameSnapshot, HostedGame, Player, Round} from '@whocards/game'
import {
  gameFeedback,
  gamePairPlayer,
  gamePair,
  gamePlayer,
  gameResponse,
  gameRound,
  gameTurn,
  hostedGame,
} from '@whocards/game/db'
import {and, asc, eq, isNull, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'

const PAIR_CODE_LENGTH = 4
const PAIR_SLOTS = [0, 1, 2]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const cryptoRandom = () => randomBytes(4).readUInt32BE() / 2 ** 32

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

// drizzle wraps driver errors in DrizzleQueryError, so the Postgres code may sit on `cause`.
const isUniqueViolation = (error: unknown): boolean =>
  errorCode(error) === '23505' || (error instanceof Error && errorCode(error.cause) === '23505')

/** A write refused on a rule the schema can't express. */
class Conflict extends Error {}

const settle = async (write: () => Promise<unknown>): Promise<WriteResult> => {
  try {
    await write()
    return 'ok'
  } catch (error) {
    if (error instanceof Conflict || isUniqueViolation(error)) return 'conflict'
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
  questionPlan: row.questionPlan,
  turnSeconds: row.turnSeconds,
  oddRule: row.oddRule,
  overtime: row.overtime,
  overtimeSeconds: row.overtimeSeconds,
  status: row.status,
  startedAt: ms(row.startedAt),
  endsAt: ms(row.endsAt),
})

/** The Drizzle adapter for the `game` port (ADR-0002); `db` is any Postgres drizzle instance. */
export const createDrizzleGamePort = <
  T extends PgQueryResultHKT,
  S extends Record<string, unknown>,
>(
  db: PgDatabase<T, S>,
  options: {now?: () => number; random?: () => number} = {}
): GamePort => {
  return {
    now: options.now ?? Date.now,
    random: options.random ?? cryptoRandom,

    findGameByCode: async (code) => {
      const [row] = await db.select().from(hostedGame).where(eq(hostedGame.code, code))
      return row ? toGame(row) : null
    },

    findPlayerByToken: async (token) => {
      const [row] = await db
        .select()
        .from(gamePlayer)
        .where(eq(gamePlayer.tokenHash, hashToken(token)))
      return row ? toPlayer(row) : null
    },

    createPlayer: async (input) => {
      const token = randomBytes(32).toString('base64url')
      // Pair codes are short, so collide now and then; the (game_id, pair_code) unique decides.
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const [row] = await db
            .insert(gamePlayer)
            .values({
              ...input,
              tokenHash: hashToken(token),
              pairCode: makeCode(PAIR_CODE_LENGTH, cryptoRandom),
            })
            .returning()
          if (row) return {player: toPlayer(row), token}
        } catch (error) {
          if (!isUniqueViolation(error)) throw error
        }
      }
      throw new Error('Could not allocate a unique pair code')
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

    createPair: ({roundId, playerIds}) =>
      settle(() =>
        db.transaction(async (tx) => {
          const [pair] = await tx.insert(gamePair).values({roundId}).returning({id: gamePair.id})
          if (!pair) throw new Error('game_pair insert returned nothing')
          await tx
            .insert(gamePairPlayer)
            .values(playerIds.map((playerId, slot) => ({pairId: pair.id, roundId, playerId, slot})))
        })
      ),

    addToPair: (input) =>
      settle(async () => {
        const rows = await db
          .select({slot: gamePairPlayer.slot})
          .from(gamePairPlayer)
          .where(eq(gamePairPlayer.pairId, input.pairId))
        const slot = PAIR_SLOTS.find((s) => !rows.some((r) => r.slot === s))
        if (slot === undefined) throw new Conflict()
        await db.insert(gamePairPlayer).values({...input, slot})
      }),

    startTurn: ({expire, ...turn}) =>
      settle(() =>
        db.transaction(async (tx) => {
          // Holding the round row makes the host's endRound wait for this turn, then close it too.
          const [round] = await tx
            .select({status: gameRound.status})
            .from(gameRound)
            .innerJoin(gamePair, eq(gamePair.roundId, gameRound.id))
            .where(eq(gamePair.id, turn.pairId))
            .for('share', {of: gameRound})
          if (round?.status !== 'live') throw new Conflict()
          for (const e of expire) {
            await tx
              .update(gameTurn)
              .set({finishedAt: new Date(e.finishedAt)})
              .where(and(eq(gameTurn.id, e.turnId), isNull(gameTurn.finishedAt)))
          }
          await tx.insert(gameTurn).values({...turn, startedAt: sql`now()`})
        })
      ),

    finishTurn: async ({turnId, finishedAt}) => {
      await db
        .update(gameTurn)
        .set({finishedAt: new Date(finishedAt)})
        .where(and(eq(gameTurn.id, turnId), isNull(gameTurn.finishedAt)))
    },

    claimTranscription: async (turnId) => {
      const claimed = await db
        .update(gameTurn)
        .set({transcribedAt: sql`now()`})
        .where(and(eq(gameTurn.id, turnId), isNull(gameTurn.transcribedAt)))
        .returning({id: gameTurn.id})
      return claimed.length > 0
    },

    releaseTranscription: async (turnId) => {
      await db.update(gameTurn).set({transcribedAt: null}).where(eq(gameTurn.id, turnId))
    },

    saveResponse: async (input) => {
      await db
        .insert(gameResponse)
        .values(input)
        .onConflictDoUpdate({
          target: gameResponse.turnId,
          set: {
            language: input.language,
            transcript: input.transcript,
            durationMs: input.durationMs,
            createdAt: sql`now()`,
            deletedAt: null,
          },
          setWhere: eq(gameResponse.playerId, input.playerId),
        })
    },

    listResponses: async (playerId) => {
      const rows = await db
        .select({
          id: gameResponse.id,
          turnId: gameResponse.turnId,
          questionId: gameTurn.questionId,
          language: gameResponse.language,
          transcript: gameResponse.transcript,
          durationMs: gameResponse.durationMs,
          createdAt: gameResponse.createdAt,
        })
        .from(gameResponse)
        .innerJoin(gameTurn, eq(gameTurn.id, gameResponse.turnId))
        .where(and(eq(gameResponse.playerId, playerId), isNull(gameResponse.deletedAt)))
        .orderBy(asc(gameResponse.createdAt))
      return rows.map((r) => ({
        ...r,
        transcript: r.transcript ?? '',
        createdAt: r.createdAt.getTime(),
      }))
    },

    deleteResponse: async ({responseId, playerId}) => {
      if (!UUID.test(responseId)) return false
      const rows = await db
        .update(gameResponse)
        .set({deletedAt: sql`now()`, transcript: null})
        .where(
          and(
            eq(gameResponse.id, responseId),
            eq(gameResponse.playerId, playerId),
            isNull(gameResponse.deletedAt)
          )
        )
        .returning({id: gameResponse.id})
      return rows.length > 0
    },

    saveFeedback: async (input) => {
      await db
        .insert(gameFeedback)
        .values(input)
        .onConflictDoUpdate({
          target: gameFeedback.playerId,
          set: {rating: input.rating, text: input.text, createdAt: sql`now()`},
        })
    },
  }
}
