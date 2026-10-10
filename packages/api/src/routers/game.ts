import {TRPCError} from '@trpc/server'
import {getDeck} from '@whocards/decks'
import {
  checkClaim,
  checkFinish,
  checkPair,
  currentRound,
  deadlineOf,
  deleteResponseInputSchema,
  drawQuestion,
  feedbackInputSchema,
  joinInputSchema,
  pairInputSchema,
  pairOf,
  playerView,
  responseInputSchema,
  screenInputSchema,
  screenView,
  turnInputSchema,
  turnsOf,
} from '@whocards/game'
import type {
  GameSnapshot,
  JoinResult,
  MyData,
  Player,
  PlayerState,
  ResolveQuestion,
  Round,
  ScreenState,
} from '@whocards/game'

import type {GamePort} from '../game/port'
import {refuse} from '../game/refusal'
import {createTRPCRouter, playerProcedure, publicProcedure} from '../trpc'

const questionResolver = (round: Round | null): ResolveQuestion => {
  const deck = round ? getDeck(round.deckSlug) : undefined
  return (id, language) => {
    const text = deck?.questions[id]
    return text?.[language] ?? text?.en ?? null
  }
}

const load = async (port: GamePort, gameId: string): Promise<GameSnapshot> => {
  const snapshot = await port.loadSnapshot(gameId)
  if (!snapshot) throw refuse('unknown_game')
  return snapshot
}

const stateOf = (snapshot: GameSnapshot, playerId: string, now: number): PlayerState => {
  const state = playerView(snapshot, playerId, now, questionResolver(currentRound(snapshot)))
  if (!state) throw new TRPCError({code: 'UNAUTHORIZED', message: 'Join the game first'})
  return state
}

const freshState = async (port: GamePort, player: Player): Promise<PlayerState> =>
  stateOf(await load(port, player.gameId), player.id, port.now())

const liveRound = (snapshot: GameSnapshot): Round => {
  if (snapshot.game.status === 'ended') throw refuse('game_over')
  const round = currentRound(snapshot)
  if (round?.status !== 'live') throw refuse('round_not_live')
  return round
}

const myData = async (port: GamePort, player: Player): Promise<MyData> => ({
  player: {
    name: player.name,
    language: player.language,
    email: player.email,
    consentTranscript: player.consentTranscript,
    consentRecap: player.consentRecap,
  },
  responses: await port.listResponses(player.id),
})

const pair = async (port: GamePort, player: Player, partnerCode: string): Promise<void> => {
  const snapshot = await load(port, player.gameId)
  const round = liveRound(snapshot)
  const partner = snapshot.players.find((p) => p.pairCode === partnerCode)
  if (!partner) throw refuse('unknown_code')

  const check = checkPair(snapshot, round, player.id, partner.id)
  if (!check.ok) throw refuse(check.reason)
  const joining = check.joinPairId
    ? snapshot.pairs.find((p) => p.id === check.joinPairId)
    : undefined
  const result = joining
    ? await port.addToPair({
        pairId: joining.id,
        roundId: round.id,
        playerId: player.id,
        slot: joining.playerIds.length,
      })
    : await port.createPair({roundId: round.id, playerIds: [player.id, partner.id]})
  if (result === 'ok') return

  // Lost a race: re-run the rules on fresh data so the refusal says what actually happened.
  const fresh = await load(port, player.gameId)
  const again = checkPair(fresh, liveRound(fresh), player.id, partner.id)
  throw refuse(again.ok ? 'partner_busy' : again.reason)
}

const claim = async (port: GamePort, player: Player): Promise<void> => {
  const snapshot = await load(port, player.gameId)
  const round = liveRound(snapshot)
  const myPair = pairOf(snapshot, round.id, player.id)
  if (!myPair) throw refuse('not_paired')

  const now = port.now()
  const check = checkClaim(round, myPair, turnsOf(snapshot, myPair.id), player.id, now)
  if (!check.ok) throw refuse(check.reason)
  if (!check.start) return

  const deck = getDeck(round.deckSlug)
  const used = new Set(
    snapshot.turns.filter((t) => t.playerId === player.id).map((t) => t.questionId)
  )
  const questionId = deck ? drawQuestion(deck.questionIds, used, port.random) : null
  if (!questionId) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `No questions in ${round.deckSlug}`,
    })
  }

  const result = await port.startTurn({
    pairId: myPair.id,
    playerId: player.id,
    questionId,
    startedAt: now,
    expire: check.expire,
  })
  if (result === 'ok') return

  const fresh = await load(port, player.gameId)
  const again = checkClaim(round, myPair, turnsOf(fresh, myPair.id), player.id, port.now())
  if (again.ok && !again.start) return
  throw refuse(again.ok ? 'partner_answering' : again.reason)
}

const finish = async (port: GamePort, player: Player): Promise<void> => {
  const snapshot = await load(port, player.gameId)
  const round = currentRound(snapshot)
  const myPair = round ? pairOf(snapshot, round.id, player.id) : null
  if (!round || !myPair) throw refuse('no_open_turn')
  const check = checkFinish(round, turnsOf(snapshot, myPair.id), player.id, port.now())
  if (!check.ok) throw refuse(check.reason)
  if (check.finish) await port.finishTurn(check.finish)
}

export const gameRouter = createTRPCRouter({
  /** Join by game code; keep the returned token and send it as PLAYER_TOKEN_HEADER from then on. */
  join: publicProcedure
    .input(joinInputSchema)
    .mutation(async ({ctx, input}): Promise<JoinResult> => {
      const game = await ctx.game.findGameByCode(input.code)
      if (!game) throw refuse('unknown_game')
      if (game.status === 'ended') throw refuse('game_over')
      const {player, token} = await ctx.game.createPlayer({
        gameId: game.id,
        name: input.name,
        language: input.language,
        email: input.email ?? null,
        consentTranscript: input.consentTranscript,
        consentRecap: input.consentRecap,
      })
      return {token, state: await freshState(ctx.game, player)}
    }),

  state: playerProcedure.query(({ctx}) => freshState(ctx.game, ctx.player)),

  /** The projector view: counts only, open to anyone with the game code. */
  screen: publicProcedure
    .input(screenInputSchema)
    .query(async ({ctx, input}): Promise<ScreenState> => {
      const game = await ctx.game.findGameByCode(input.code)
      if (!game) throw refuse('unknown_game')
      return screenView(await load(ctx.game, game.id), ctx.game.now())
    }),

  round: createTRPCRouter({
    pair: playerProcedure.input(pairInputSchema).mutation(async ({ctx, input}) => {
      await pair(ctx.game, ctx.player, input.partnerCode)
      return freshState(ctx.game, ctx.player)
    }),

    turn: playerProcedure.input(turnInputSchema).mutation(async ({ctx, input}) => {
      await (input.action === 'claim' ? claim : finish)(ctx.game, ctx.player)
      return freshState(ctx.game, ctx.player)
    }),

    /** Saves the transcript of my turn, finishing the turn first if it's still open. */
    response: playerProcedure.input(responseInputSchema).mutation(async ({ctx, input}) => {
      const snapshot = await load(ctx.game, ctx.player.gameId)
      const turn = snapshot.turns.find((t) => t.id === input.turnId)
      const turnPair = turn && snapshot.pairs.find((p) => p.id === turn.pairId)
      const round = turnPair && snapshot.rounds.find((r) => r.id === turnPair.roundId)
      if (!turn || !round || turn.playerId !== ctx.player.id) throw refuse('not_found')

      if (turn.finishedAt === null) {
        const finishedAt = Math.min(ctx.game.now(), deadlineOf(round, turn))
        await ctx.game.finishTurn({turnId: turn.id, finishedAt})
      }
      await ctx.game.saveResponse({
        turnId: turn.id,
        playerId: ctx.player.id,
        language: input.language,
        transcript: input.transcript,
        durationMs: input.durationMs,
      })
      return freshState(ctx.game, ctx.player)
    }),
  }),

  feedback: playerProcedure.input(feedbackInputSchema).mutation(async ({ctx, input}) => {
    await ctx.game.saveFeedback({
      gameId: ctx.player.gameId,
      playerId: ctx.player.id,
      rating: input.rating,
      text: input.text || null,
    })
    return freshState(ctx.game, ctx.player)
  }),

  me: createTRPCRouter({
    get: playerProcedure.query(({ctx}) => myData(ctx.game, ctx.player)),

    deleteResponse: playerProcedure
      .input(deleteResponseInputSchema)
      .mutation(async ({ctx, input}) => {
        const deleted = await ctx.game.deleteResponse({
          responseId: input.responseId,
          playerId: ctx.player.id,
        })
        if (!deleted) throw refuse('not_found')
        return myData(ctx.game, ctx.player)
      }),
  }),
})
