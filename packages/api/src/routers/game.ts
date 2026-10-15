import {TRPCError} from '@trpc/server'
import {getDeck} from '@whocards/decks'
import {
  answerModeAt,
  checkClaim,
  checkFinish,
  checkPair,
  currentRound,
  customQuestionsOf,
  deleteResponseInputSchema,
  editResponseInputSchema,
  feedbackInputSchema,
  finishedAtOf,
  joinInputSchema,
  matchName,
  pairCandidatesInputSchema,
  pairInputSchema,
  pairOf,
  PHYSICAL_QUESTION_ID,
  planOf,
  playerView,
  questionForTurn,
  questionText,
  readPairCode,
  refOf,
  responseInputSchema,
  screenInputSchema,
  screenView,
  turnInputSchema,
  turnsOf,
  usedRefs,
  voteInputSchema,
} from '@whocards/game'
import type {
  GameSnapshot,
  JoinResult,
  MyData,
  PairCandidate,
  PairInput,
  Player,
  PlayerState,
  QuestionSources,
  ResolveQuestion,
  Round,
  ScreenState,
} from '@whocards/game'

import {saveAnswer} from '../game/answer'
import type {GamePort} from '../game/port'
import {refuse} from '../game/refusal'
import {createTRPCRouter, playerProcedure, publicProcedure} from '../trpc'

const sourcesOf = (snapshot: GameSnapshot): QuestionSources => ({
  custom: customQuestionsOf(snapshot.game.settings),
  decks: getDeck,
})

const questionResolver = (snapshot: GameSnapshot, round: Round | null): ResolveQuestion => {
  const sources = sourcesOf(snapshot)
  return (id, language) => questionText(refOf(id, round?.deckSlug ?? ''), language, sources)
}

const load = async (port: GamePort, gameId: string): Promise<GameSnapshot> => {
  const snapshot = await port.loadSnapshot(gameId)
  if (!snapshot) throw refuse('unknown_game')
  return snapshot
}

const stateOf = (snapshot: GameSnapshot, playerId: string, now: number): PlayerState => {
  const state = playerView(
    snapshot,
    playerId,
    now,
    questionResolver(snapshot, currentRound(snapshot))
  )
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

/** A typed string that is some player's pair code wins over a name match. */
const partnerOf = (snapshot: GameSnapshot, round: Round, me: Player, input: PairInput): Player => {
  if ('partnerCode' in input) {
    const partner = snapshot.players.find((p) => p.pairCode === input.partnerCode)
    if (!partner) throw refuse('unknown_code')
    return partner
  }
  if ('partnerId' in input) {
    const partner = snapshot.players.find((p) => p.id === input.partnerId)
    if (!partner) throw refuse('unknown_code')
    return partner
  }
  const code = readPairCode(input.partner)
  const byCode = code ? snapshot.players.find((p) => p.pairCode === code) : undefined
  if (byCode) return byCode

  const {matches, eligible} = matchName(snapshot, round, me.id, input.partner)
  const [only] = eligible
  if (only && eligible.length === 1) return only
  if (eligible.length > 1) throw refuse('ambiguous_name')
  const [first] = matches
  if (!first) throw refuse('unknown_name')
  // Every match is refused: let the rules say why.
  return first
}

const pair = async (port: GamePort, player: Player, input: PairInput): Promise<void> => {
  const snapshot = await load(port, player.gameId)
  const round = liveRound(snapshot)
  const partner = partnerOf(snapshot, round, player, input)

  const check = checkPair(snapshot, round, player.id, partner.id)
  if (!check.ok) throw refuse(check.reason)
  const joining = check.joinPairId
    ? snapshot.pairs.find((p) => p.id === check.joinPairId)
    : undefined
  const result = joining
    ? await port.addToPair({pairId: joining.id, roundId: round.id, playerId: player.id})
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

  const questionId = questionForTurn({
    plan: planOf(round),
    turnIndex: turnsOf(snapshot, myPair.id).length,
    used: usedRefs(snapshot, player.id),
    random: port.random,
    sources: sourcesOf(snapshot),
  })
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
    expire: check.expire,
  })
  if (result === 'ok') return

  const fresh = await load(port, player.gameId)
  const freshRound = fresh.rounds.find((r) => r.id === round.id) ?? round
  const again = checkClaim(freshRound, myPair, turnsOf(fresh, myPair.id), player.id, port.now())
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
      if (game.status === 'lobby') throw refuse('not_open')
      if (game.status === 'ended') throw refuse('game_over')
      const standby = input.standbyKey !== undefined
      if (standby && input.standbyKey !== game.settings.standbyKey) throw refuse('standby_key')
      const {player, token} = await ctx.game.createPlayer({
        gameId: game.id,
        name: input.name,
        language: input.language,
        email: input.email ?? null,
        consentTranscript: input.consentTranscript,
        consentRecap: input.consentRecap,
        standby,
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
      await pair(ctx.game, ctx.player, input)
      return freshState(ctx.game, ctx.player)
    }),

    /** Players with this name I could pair with now, for the pick list after `ambiguous_name`; never codes or emails. */
    candidates: playerProcedure
      .input(pairCandidatesInputSchema)
      .query(async ({ctx, input}): Promise<PairCandidate[]> => {
        const snapshot = await load(ctx.game, ctx.player.gameId)
        const round = liveRound(snapshot)
        return matchName(snapshot, round, ctx.player.id, input.partner).eligible.map((p) => ({
          id: p.id,
          name: p.name,
          language: p.language,
          joinedAt: p.joinedAt,
        }))
      }),

    turn: playerProcedure.input(turnInputSchema).mutation(async ({ctx, input}) => {
      await (input.action === 'claim' ? claim : finish)(ctx.game, ctx.player)
      return freshState(ctx.game, ctx.player)
    }),

    /** Saves the transcript of my turn, finishing the turn first if it's still open. */
    response: playerProcedure.input(responseInputSchema).mutation(async ({ctx, input}) => {
      const snapshot = await load(ctx.game, ctx.player.gameId)
      const turn = snapshot.turns.find((t) => t.id === input.turnId)
      const round = turn && snapshot.rounds.find((r) => r.id === turn.roundId)
      if (!turn || !round || turn.playerId !== ctx.player.id) throw refuse('not_found')
      if (!ctx.player.consentTranscript) throw refuse('no_consent')
      if (answerModeAt(snapshot.game.settings, turn.startedAt) === 'none') {
        throw refuse('wrong_answer_mode')
      }

      await saveAnswer(ctx.game, round, turn, {
        playerId: ctx.player.id,
        language: input.language,
        transcript: input.transcript,
        durationMs: input.durationMs,
      })
      return freshState(ctx.game, ctx.player)
    }),

    /** Thumbs up or down on my own finished turn's question; null clears it. */
    vote: playerProcedure.input(voteInputSchema).mutation(async ({ctx, input}) => {
      const snapshot = await load(ctx.game, ctx.player.gameId)
      const turn = snapshot.turns.find((t) => t.id === input.turnId)
      const round = turn && snapshot.rounds.find((r) => r.id === turn.roundId)
      if (!turn || !round) throw refuse('not_found')
      if (turn.playerId !== ctx.player.id) throw refuse('not_your_turn')
      if (turn.questionId === PHYSICAL_QUESTION_ID) throw refuse('physical_card')
      if (finishedAtOf(round, turn, ctx.game.now()) === null) throw refuse('still_answering')
      await ctx.game.voteQuestion({turnId: turn.id, vote: input.vote})
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

    editResponse: playerProcedure.input(editResponseInputSchema).mutation(async ({ctx, input}) => {
      const edited = await ctx.game.editResponse({
        responseId: input.responseId,
        playerId: ctx.player.id,
        transcript: input.transcript,
      })
      if (!edited) throw refuse('not_found')
      return myData(ctx.game, ctx.player)
    }),

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
