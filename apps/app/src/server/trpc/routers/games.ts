import {TRPCError} from '@trpc/server'
import {getAllDecks, getDeck} from '@whocards/decks'
import {
  canMoveGame,
  checkStartRound,
  currentRound,
  roundSettingsSchema,
  roundView,
  screenView,
} from '@whocards/game'
import type {
  GameLanguage,
  GameSnapshot,
  GameStatus,
  HostedGame,
  RoundSettings,
  RoundView,
} from '@whocards/game'
import {z} from 'zod'

import {createTRPCRouter, roleProcedure} from '../trpc'
import {
  buildRecaps,
  GAMES_MIN_ROLE,
  plannedRoundEnd,
  readRecapState,
  strandedByRemoval,
} from './games-logic'
import type {Recap, RecapState} from './games-logic'

export type WriteResult = 'ok' | 'conflict' | 'stale'

export type GameSummary = {
  id: string
  code: string
  title: string
  status: GameStatus
  createdAt: number
  players: number
  rounds: number
}

/** Persistence the host router needs; the Drizzle version lives in games-store.ts. */
export type HostStore = {
  now: () => number
  random: () => number
  listGames: (createdBy: string) => Promise<GameSummary[]>
  createGame: (input: {title: string; createdBy: string}) => Promise<HostedGame>
  loadSnapshot: (gameId: string) => Promise<GameSnapshot | null>
  /** Saved, not deleted, answers per player id. */
  savedResponses: (gameId: string) => Promise<Record<string, number>>
  addRound: (input: RoundSettings & {gameId: string; n: number}) => Promise<WriteResult>
  /** Writes only while the round is still in `whileStatus`. */
  updateRound: (input: {
    roundId: string
    whileStatus: 'pending' | 'live'
    settings: RoundSettings
  }) => Promise<WriteResult>
  /** Moves a lobby game to live, then the pending round to live; 'conflict' when another round is live. */
  startRound: (input: {
    gameId: string
    roundId: string
    startedAt: number
    endsAt: number
  }) => Promise<WriteResult>
  /** Ends the live round and closes its open turns, in one transaction with any turn being claimed. */
  endRound: (input: {roundId: string; endedAt: number}) => Promise<WriteResult>
  /** Ends the live round, its open turns and the game atomically; true only for the caller that moved the game to ended, which sends the recap. */
  endGame: (input: {gameId: string; endedAt: number}) => Promise<boolean>
  saveRecapState: (gameId: string, recap: RecapState) => Promise<void>
  /** Deletes the player; `release` frees partners stranded in this round's pair so they can re-pair. */
  removePlayer: (input: {
    gameId: string
    playerId: string
    release: {pairId: string; playerIds: string[]} | null
  }) => Promise<boolean>
}

export type SendRecaps = (recaps: Recap[]) => Promise<Omit<RecapState, 'sentAt'>>

const gameIdSchema = z.object({gameId: z.string().uuid()})
const roundIdSchema = gameIdSchema.extend({roundId: z.string().uuid()})

const deckSlugSchema = z.string().refine((slug) => getDeck(slug) !== undefined, 'Unknown deck')
const roundInputSchema = roundSettingsSchema.extend({deckSlug: deckSlugSchema})

const fail = (code: TRPCError['code'], message: string) => new TRPCError({code, message})

const START_REFUSALS = {
  game_not_live: 'The game is over.',
  round_not_pending: 'That round already ran.',
  other_round_live: 'End the live round first.',
} as const

export type GameDetail = {
  serverNow: number
  game: {id: string; code: string; title: string; status: GameStatus; recap: RecapState | null}
  players: Array<{id: string; name: string; language: GameLanguage; recap: boolean}>
  rounds: Array<RoundView & {pairs: number; turns: number}>
  liveRoundId: string | null
  counts: {players: number; pairs: number; turnsInProgress: number; responses: number}
}

const detailOf = (
  snapshot: GameSnapshot,
  saved: Record<string, number>,
  now: number
): GameDetail => {
  const screen = screenView(snapshot, now)
  const round = currentRound(snapshot)
  const pairsByRound = new Map<string, number>()
  for (const pair of snapshot.pairs) {
    pairsByRound.set(pair.roundId, (pairsByRound.get(pair.roundId) ?? 0) + 1)
  }
  return {
    serverNow: now,
    game: {
      id: snapshot.game.id,
      code: snapshot.game.code,
      title: snapshot.game.title,
      status: snapshot.game.status,
      recap: readRecapState(snapshot.game.settings),
    },
    players: snapshot.players.map((p) => ({
      id: p.id,
      name: p.name,
      language: p.language,
      recap: p.consentRecap && p.email !== null,
    })),
    rounds: snapshot.rounds.map((r) => ({
      ...roundView(r),
      pairs: pairsByRound.get(r.id) ?? 0,
      turns: snapshot.turns.filter((t) => t.roundId === r.id).length,
    })),
    liveRoundId: round?.status === 'live' ? round.id : null,
    counts: {
      players: snapshot.players.length,
      pairs: round ? (pairsByRound.get(round.id) ?? 0) : 0,
      turnsInProgress: screen.counts.talking,
      responses: Object.values(saved).reduce((sum, n) => sum + n, 0),
    },
  }
}

export const createGamesRouter = ({
  store,
  sendRecaps,
}: {
  store: HostStore
  sendRecaps: SendRecaps
}) => {
  const procedure = roleProcedure(GAMES_MIN_ROLE)

  const load = async (gameId: string) => {
    const snapshot = await store.loadSnapshot(gameId)
    if (!snapshot) throw fail('NOT_FOUND', 'No such game.')
    return snapshot
  }

  const roundIn = (snapshot: GameSnapshot, roundId: string) => {
    const round = snapshot.rounds.find((r) => r.id === roundId)
    if (!round) throw fail('NOT_FOUND', 'No such round.')
    return round
  }

  const detail = async (gameId: string) => {
    const [snapshot, saved] = await Promise.all([load(gameId), store.savedResponses(gameId)])
    return detailOf(snapshot, saved, store.now())
  }

  const conflictOr = (result: WriteResult, message: string) => {
    if (result !== 'ok') throw fail('CONFLICT', message)
  }

  const endLiveRound = async (snapshot: GameSnapshot, roundId: string) => {
    const round = roundIn(snapshot, roundId)
    if (round.status !== 'live') throw fail('BAD_REQUEST', 'That round is not live.')
    const result = await store.endRound({roundId, endedAt: store.now()})
    conflictOr(result, 'That round already ended.')
  }

  return createTRPCRouter({
    list: procedure.query(({ctx}) => store.listGames(ctx.user.id)),

    decks: procedure.query(() =>
      getAllDecks().map((d) => ({slug: d.slug, title: d.title, questions: d.questionIds.length}))
    ),

    create: procedure
      .input(z.object({title: z.string().trim().min(1).max(80)}))
      .mutation(({ctx, input}) => store.createGame({title: input.title, createdBy: ctx.user.id})),

    detail: procedure.input(gameIdSchema).query(({input}) => detail(input.gameId)),

    addRound: procedure
      .input(gameIdSchema.extend({settings: roundInputSchema}))
      .mutation(async ({input}) => {
        const snapshot = await load(input.gameId)
        if (snapshot.game.status === 'ended') throw fail('BAD_REQUEST', 'The game is over.')
        const n = Math.max(0, ...snapshot.rounds.map((r) => r.n)) + 1
        conflictOr(
          await store.addRound({...input.settings, gameId: input.gameId, n}),
          'Someone else just added a round. Try again.'
        )
        return detail(input.gameId)
      }),

    updateRound: procedure
      .input(roundIdSchema.extend({settings: roundInputSchema}))
      .mutation(async ({input}) => {
        const snapshot = await load(input.gameId)
        const round = roundIn(snapshot, input.roundId)
        if (round.status === 'done') throw fail('BAD_REQUEST', 'That round is over.')
        if (round.status === 'live' && input.settings.deckSlug !== round.deckSlug) {
          throw fail('BAD_REQUEST', 'The deck is fixed once a round starts.')
        }
        conflictOr(
          await store.updateRound({
            roundId: round.id,
            whileStatus: round.status,
            settings: input.settings,
          }),
          'The round changed meanwhile. Reload and try again.'
        )
        return detail(input.gameId)
      }),

    startRound: procedure.input(roundIdSchema).mutation(async ({input}) => {
      const snapshot = await load(input.gameId)
      const round = roundIn(snapshot, input.roundId)
      const {status} = snapshot.game
      if (status !== 'live' && !canMoveGame(status, 'live')) {
        throw fail('BAD_REQUEST', START_REFUSALS.game_not_live)
      }
      // A lobby game goes live with its first round; check the round as if it already had.
      const check = checkStartRound({...snapshot, game: {...snapshot.game, status: 'live'}}, round)
      if (!check.ok) throw fail('BAD_REQUEST', START_REFUSALS[check.reason])

      const now = store.now()
      const result = await store.startRound({
        gameId: input.gameId,
        roundId: round.id,
        startedAt: now,
        endsAt: plannedRoundEnd(round, now),
      })
      conflictOr(result, START_REFUSALS.other_round_live)
      return detail(input.gameId)
    }),

    endRound: procedure.input(roundIdSchema).mutation(async ({input}) => {
      await endLiveRound(await load(input.gameId), input.roundId)
      return detail(input.gameId)
    }),

    endGame: procedure.input(gameIdSchema).mutation(async ({input}) => {
      const snapshot = await load(input.gameId)
      if (snapshot.game.status === 'ended') return detail(input.gameId)
      if (!canMoveGame(snapshot.game.status, 'ended')) {
        throw fail('BAD_REQUEST', 'This game cannot end from here.')
      }
      if (!(await store.endGame({gameId: input.gameId, endedAt: store.now()}))) {
        return detail(input.gameId)
      }

      const [final, saved] = await Promise.all([
        load(input.gameId),
        store.savedResponses(input.gameId),
      ])
      const recaps = buildRecaps({
        snapshot: final,
        savedByPlayer: saved,
        now: store.now(),
        random: store.random,
      })
      const result = await sendRecaps(recaps).catch((error: unknown) => ({
        sent: 0,
        failed: recaps.length,
        error: error instanceof Error ? error.message : String(error),
      }))
      await store.saveRecapState(input.gameId, {sentAt: store.now(), ...result})
      return detail(input.gameId)
    }),

    removePlayer: procedure
      .input(gameIdSchema.extend({playerId: z.string().uuid()}))
      .mutation(async ({input}) => {
        const snapshot = await load(input.gameId)
        if (!snapshot.players.some((p) => p.id === input.playerId)) {
          throw fail('NOT_FOUND', 'No such player.')
        }
        await store.removePlayer({
          gameId: input.gameId,
          playerId: input.playerId,
          release: strandedByRemoval(snapshot, input.playerId),
        })
        return detail(input.gameId)
      }),
  })
}
