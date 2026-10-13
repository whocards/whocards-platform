import {TRPCError} from '@trpc/server'
import {getAllDecks, getDeck} from '@whocards/decks'
import {
  canMoveGame,
  checkStartRound,
  currentRound,
  organizerSchema,
  roundSettingsSchema,
  roundView,
  screenView,
} from '@whocards/game'
import type {GameRecapProps} from '@whocards/emails'
import type {
  GameLanguage,
  GameSnapshot,
  GameStatus,
  HostedGame,
  RoundSettings,
  RoundView,
} from '@whocards/game'
import {z} from 'zod'

import {roleAtLeast} from '../../auth/permissions'
import {createTRPCRouter, roleProcedure} from '../trpc'
import {
  buildRecaps,
  GAMES_MIN_ROLE,
  hostAccess,
  organizerOf,
  plannedRoundEnd,
  previewRecap,
  readRecapState,
  strandedByRemoval,
} from './games-logic'
import type {GameHosts, Recap, RecapState} from './games-logic'

export type WriteResult = 'ok' | 'conflict' | 'stale'

/** A facilitator as hosts see them: name, else email. */
export type HostUser = {id: string; label: string}

export type GameSummary = {
  id: string
  code: string
  title: string
  organizer: string | null
  /** The creator's label; null if that account is gone. */
  createdBy: string | null
  /** Co-facilitator labels. */
  facilitators: string[]
  status: GameStatus
  createdAt: number
  players: number
  rounds: number
}

/** Persistence the host router needs; the Drizzle version lives in games-store.ts. */
export type HostStore = {
  now: () => number
  random: () => number
  /** Newest first; games `userId` created or co-facilitates, or every game when null. */
  listGames: (userId: string | null) => Promise<GameSummary[]>
  createGame: (input: {title: string; organizer: string; createdBy: string}) => Promise<HostedGame>
  /** The creator and co-facilitator ids; null when there is no such game. */
  hostsOf: (gameId: string) => Promise<GameHosts | null>
  /** Labels for these user ids, in the given order, skipping unknown ones. */
  usersByIds: (ids: string[]) => Promise<HostUser[]>
  /** Members of the organization at facilitator or above. */
  facilitatorsIn: (organizationId: string) => Promise<HostUser[]>
  /** Adds or removes one co-facilitator id atomically, leaving the rest of the list alone. */
  setFacilitator: (input: {gameId: string; userId: string; on: boolean}) => Promise<void>
  /** Writes only while the game has not ended. */
  updateGame: (input: {gameId: string; title: string; organizer: string}) => Promise<WriteResult>
  /** Draft (lobby) to live; false if the game was no longer a draft. */
  goLive: (gameId: string) => Promise<boolean>
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
  /** Pending round to live in a live game; 'conflict' when another round is live, 'stale' when the game or round moved on. */
  startRound: (input: {
    gameId: string
    roundId: string
    startedAt: number
    endsAt: number
  }) => Promise<WriteResult>
  /** Ends the live round and closes its open turns, in one transaction with any turn being claimed. */
  endRound: (input: {roundId: string; endedAt: number}) => Promise<WriteResult>
  /** Ends the live round, its open turns and the game atomically. */
  endGame: (input: {gameId: string; endedAt: number}) => Promise<void>
  /** Stores `claim` only if the ended game has no recap yet, or one that sent nothing; true for the one caller that gets to send. */
  claimRecap: (gameId: string, claim: RecapState) => Promise<boolean>
  saveRecapState: (gameId: string, recap: RecapState) => Promise<void>
  /** Deletes the player; `release` frees partners stranded in this round's pair so they can re-pair. */
  removePlayer: (input: {
    gameId: string
    playerId: string
    release: {pairId: string; playerIds: string[]} | null
  }) => Promise<boolean>
}

export type SendRecaps = (recaps: Recap[]) => Promise<Pick<RecapState, 'sent' | 'failed' | 'error'>>
export type RenderRecap = (props: GameRecapProps) => Promise<string>

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

const STALE = 'Another host changed this game meanwhile. Check the page and try again.'

const gameDetailsSchema = z.object({
  title: z.string().trim().min(1).max(80),
  organizer: organizerSchema,
})

export type GameDetail = {
  serverNow: number
  game: {
    id: string
    code: string
    title: string
    organizer: string | null
    createdBy: string | null
    facilitators: HostUser[]
    /** The caller is an admin or the creator, so may change `facilitators`. */
    canManageHosts: boolean
    status: GameStatus
    recap: RecapState | null
  }
  players: Array<{id: string; name: string; language: GameLanguage; recap: boolean}>
  rounds: Array<RoundView & {pairs: number; turns: number}>
  liveRoundId: string | null
  counts: {players: number; pairs: number; turnsInProgress: number; responses: number}
}

type Hosting = Pick<GameDetail['game'], 'createdBy' | 'facilitators' | 'canManageHosts'>

const detailOf = (
  snapshot: GameSnapshot,
  saved: Record<string, number>,
  hosting: Hosting,
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
      organizer: organizerOf(snapshot),
      ...hosting,
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

const roundIn = (snapshot: GameSnapshot, roundId: string) => {
  const round = snapshot.rounds.find((r) => r.id === roundId)
  if (!round) throw fail('NOT_FOUND', 'No such round.')
  return round
}

const conflictOr = (result: WriteResult, message: string) => {
  if (result !== 'ok') throw fail('CONFLICT', message)
}

const managing = (ctx: {canManageHosts: boolean}) => {
  if (!ctx.canManageHosts) {
    throw fail('FORBIDDEN', 'Only the creator or an admin can change the co-facilitators.')
  }
}

export const createGamesRouter = ({
  store,
  sendRecaps,
  renderRecap,
}: {
  store: HostStore
  sendRecaps: SendRecaps
  renderRecap: RenderRecap
}) => {
  const procedure = roleProcedure(GAMES_MIN_ROLE)

  /** Every procedure on one game: callers who can't host it get NOT_FOUND, so its existence doesn't leak. */
  const gameProcedure = procedure.use(async ({ctx, getRawInput, next}) => {
    const parsed = gameIdSchema.safeParse(await getRawInput())
    if (!parsed.success) throw fail('BAD_REQUEST', 'Missing game id.')
    const hosts = await store.hostsOf(parsed.data.gameId)
    const access = hosts && hostAccess(hosts, {id: ctx.user.id, role: ctx.membership.role})
    if (!hosts || !access) throw fail('NOT_FOUND', 'No such game.')
    return next({ctx: {...ctx, hosts, canManageHosts: access === 'manage'}})
  })

  const load = async (gameId: string) => {
    const snapshot = await store.loadSnapshot(gameId)
    if (!snapshot) throw fail('NOT_FOUND', 'No such game.')
    return snapshot
  }

  const detail = async (gameId: string, ctx: {canManageHosts: boolean}) => {
    const [snapshot, saved, hosts] = await Promise.all([
      load(gameId),
      store.savedResponses(gameId),
      store.hostsOf(gameId),
    ])
    const users = await store.usersByIds([
      ...(hosts?.createdBy ? [hosts.createdBy] : []),
      ...(hosts?.facilitators ?? []),
    ])
    const hosting = {
      createdBy: users.find((u) => u.id === hosts?.createdBy)?.label ?? null,
      facilitators: users.filter((u) => hosts?.facilitators.includes(u.id)),
      canManageHosts: ctx.canManageHosts,
    }
    return detailOf(snapshot, saved, hosting, store.now())
  }

  const loadEnded = async (gameId: string) => {
    const snapshot = await load(gameId)
    if (snapshot.game.status !== 'ended') throw fail('BAD_REQUEST', 'End the game first.')
    return snapshot
  }

  const endLiveRound = async (snapshot: GameSnapshot, roundId: string) => {
    const round = roundIn(snapshot, roundId)
    if (round.status !== 'live') throw fail('BAD_REQUEST', 'That round is not live.')
    const result = await store.endRound({roundId, endedAt: store.now()})
    conflictOr(result, 'That round already ended.')
  }

  return createTRPCRouter({
    list: procedure.query(({ctx}) =>
      store.listGames(roleAtLeast(ctx.membership.role, 'admin') ? null : ctx.user.id)
    ),

    decks: procedure.query(() =>
      getAllDecks().map((d) => ({slug: d.slug, title: d.title, questions: d.questionIds.length}))
    ),

    create: procedure
      .input(gameDetailsSchema)
      .mutation(({ctx, input}) => store.createGame({...input, createdBy: ctx.user.id})),

    detail: gameProcedure.input(gameIdSchema).query(({ctx, input}) => detail(input.gameId, ctx)),

    /** Who can be added as a co-facilitator: org members at facilitator or above, minus current hosts. */
    facilitatorOptions: gameProcedure.input(gameIdSchema).query(async ({ctx}) => {
      managing(ctx)
      const taken = new Set([ctx.hosts.createdBy, ...ctx.hosts.facilitators])
      return (await store.facilitatorsIn(ctx.membership.organizationId)).filter(
        (u) => !taken.has(u.id)
      )
    }),

    setFacilitator: gameProcedure
      .input(gameIdSchema.extend({userId: z.string().min(1), on: z.boolean()}))
      .mutation(async ({ctx, input}) => {
        managing(ctx)
        if (input.on) {
          const members = await store.facilitatorsIn(ctx.membership.organizationId)
          if (!members.some((u) => u.id === input.userId)) {
            throw fail('BAD_REQUEST', 'Only facilitators in this organization can co-host.')
          }
        }
        if (input.userId !== ctx.hosts.createdBy) await store.setFacilitator(input)
        return detail(input.gameId, ctx)
      }),

    updateGame: gameProcedure
      .input(gameIdSchema.extend(gameDetailsSchema.shape))
      .mutation(async ({ctx, input}) => {
        await load(input.gameId)
        conflictOr(await store.updateGame(input), 'The game is over.')
        return detail(input.gameId, ctx)
      }),

    /** Opens joining. A second host pressing it too just sees the game live. */
    goLive: gameProcedure.input(gameIdSchema).mutation(async ({ctx, input}) => {
      const {status} = (await load(input.gameId)).game
      if (status === 'ended') throw fail('BAD_REQUEST', 'The game is over.')
      if (status === 'lobby' && !(await store.goLive(input.gameId))) {
        const after = await load(input.gameId)
        if (after.game.status !== 'live') throw fail('CONFLICT', 'The game ended meanwhile.')
      }
      return detail(input.gameId, ctx)
    }),

    addRound: gameProcedure
      .input(gameIdSchema.extend({settings: roundInputSchema}))
      .mutation(async ({ctx, input}) => {
        const snapshot = await load(input.gameId)
        if (snapshot.game.status === 'ended') throw fail('BAD_REQUEST', 'The game is over.')
        const n = Math.max(0, ...snapshot.rounds.map((r) => r.n)) + 1
        conflictOr(
          await store.addRound({...input.settings, gameId: input.gameId, n}),
          'Someone else just added a round. Try again.'
        )
        return detail(input.gameId, ctx)
      }),

    updateRound: gameProcedure
      .input(roundIdSchema.extend({settings: roundInputSchema}))
      .mutation(async ({ctx, input}) => {
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
        return detail(input.gameId, ctx)
      }),

    startRound: gameProcedure.input(roundIdSchema).mutation(async ({ctx, input}) => {
      const snapshot = await load(input.gameId)
      const round = roundIn(snapshot, input.roundId)
      if (snapshot.game.status === 'lobby') {
        throw fail('BAD_REQUEST', 'Go live first, so players can join.')
      }
      const check = checkStartRound(snapshot, round)
      if (!check.ok) throw fail('BAD_REQUEST', START_REFUSALS[check.reason])

      const now = store.now()
      const result = await store.startRound({
        gameId: input.gameId,
        roundId: round.id,
        startedAt: now,
        endsAt: plannedRoundEnd(round, now),
      })
      if (result === 'conflict') throw fail('CONFLICT', START_REFUSALS.other_round_live)
      conflictOr(result, STALE)
      return detail(input.gameId, ctx)
    }),

    endRound: gameProcedure.input(roundIdSchema).mutation(async ({ctx, input}) => {
      await endLiveRound(await load(input.gameId), input.roundId)
      return detail(input.gameId, ctx)
    }),

    /** Ends the game only; the host previews the recap and sends it separately. */
    endGame: gameProcedure.input(gameIdSchema).mutation(async ({ctx, input}) => {
      const snapshot = await load(input.gameId)
      if (snapshot.game.status === 'ended') return detail(input.gameId, ctx)
      if (!canMoveGame(snapshot.game.status, 'ended')) {
        throw fail('BAD_REQUEST', 'This game cannot end from here.')
      }
      await store.endGame({gameId: input.gameId, endedAt: store.now()})
      return detail(input.gameId, ctx)
    }),

    recapPreview: gameProcedure.input(gameIdSchema).query(async ({input}) => {
      const [snapshot, saved] = await Promise.all([
        loadEnded(input.gameId),
        store.savedResponses(input.gameId),
      ])
      const preview = previewRecap({
        snapshot,
        savedByPlayer: saved,
        now: store.now(),
        random: store.random,
      })
      return {
        recipients: preview.recipients,
        sample: preview.sample,
        html: await renderRecap(preview.props),
      }
    }),

    /** Sends once per game: the conditional claim lets exactly one host through. */
    sendRecaps: gameProcedure.input(gameIdSchema).mutation(async ({ctx, input}) => {
      const [snapshot, saved] = await Promise.all([
        loadEnded(input.gameId),
        store.savedResponses(input.gameId),
      ])
      const recaps = buildRecaps({
        snapshot,
        savedByPlayer: saved,
        now: store.now(),
        random: store.random,
      })
      if (recaps.length === 0) throw fail('BAD_REQUEST', 'Nobody asked for a recap.')
      const claim = {sentAt: store.now(), sent: 0, failed: 0, error: null, pending: true}
      if (!(await store.claimRecap(input.gameId, claim))) return detail(input.gameId, ctx)

      const result = await sendRecaps(recaps).catch((error: unknown) => ({
        sent: 0,
        failed: recaps.length,
        error: error instanceof Error ? error.message : String(error),
      }))
      await store.saveRecapState(input.gameId, {...claim, ...result, pending: false})
      return detail(input.gameId, ctx)
    }),

    removePlayer: gameProcedure
      .input(gameIdSchema.extend({playerId: z.string().uuid()}))
      .mutation(async ({ctx, input}) => {
        const snapshot = await load(input.gameId)
        if (!snapshot.players.some((p) => p.id === input.playerId)) {
          throw fail('NOT_FOUND', 'No such player.')
        }
        await store.removePlayer({
          gameId: input.gameId,
          playerId: input.playerId,
          release: strandedByRemoval(snapshot, input.playerId),
        })
        return detail(input.gameId, ctx)
      }),
  })
}
