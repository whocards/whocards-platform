import type {GameSnapshot, HostedGame, Player, ResponseRecord, Round} from '@whocards/game'

import type {GamePort} from './port'

const clone = (s: GameSnapshot): GameSnapshot => ({
  game: {...s.game},
  players: s.players.map((p) => ({...p})),
  rounds: s.rounds.map((r) => ({...r})),
  pairs: s.pairs.map((p) => ({...p, playerIds: [...p.playerIds]})),
  turns: s.turns.map((t) => ({...t})),
})

type StoredResponse = ResponseRecord & {playerId: string; deletedAt: number | null}

/** In-memory GamePort that enforces the same uniqueness rules as the Postgres schema. */
export const createFakeGamePort = (seed: {game: HostedGame; rounds?: Round[]}) => {
  let clock = 1_000_000
  let ids = 0
  const nextId = (prefix: string) => `${prefix}${++ids}`
  const snapshot: GameSnapshot = {
    game: seed.game,
    players: [],
    rounds: seed.rounds ?? [],
    pairs: [],
    turns: [],
  }
  const tokens = new Map<string, string>()
  const responses: StoredResponse[] = []
  const feedback = new Map<string, {rating: number; text: string | null}>()
  const transcribed = new Set<string>()

  const port: GamePort = {
    now: () => clock,
    random: () => 0,
    findGameByCode: async (code) => (code === snapshot.game.code ? snapshot.game : null),
    findPlayerByToken: async (token) => {
      const id = tokens.get(token)
      return snapshot.players.find((p) => p.id === id) ?? null
    },
    createPlayer: async ({standby, ...input}) => {
      const player: Player = {
        ...input,
        id: nextId('player'),
        joinedAt: clock,
        pairCode: `P${String(ids).padStart(3, '0')}`,
      }
      snapshot.players.push(player)
      if (standby) {
        const {settings} = snapshot.game
        snapshot.game.settings = {...settings, standby: [...(settings.standby ?? []), player.id]}
      }
      const token = `token-${player.id}`
      tokens.set(token, player.id)
      return {player, token}
    },
    loadSnapshot: async (gameId) => (gameId === snapshot.game.id ? clone(snapshot) : null),
    createPair: async ({roundId, playerIds}) => {
      const taken = snapshot.pairs.some(
        (p) => p.roundId === roundId && p.playerIds.some((id) => playerIds.includes(id))
      )
      if (taken) return 'conflict'
      snapshot.pairs.push({id: nextId('pair'), roundId, playerIds: [...playerIds]})
      return 'ok'
    },
    addToPair: async ({pairId, roundId, playerId}) => {
      const pair = snapshot.pairs.find((p) => p.id === pairId)
      const taken = snapshot.pairs.some(
        (p) => p.roundId === roundId && p.playerIds.includes(playerId)
      )
      if (!pair || taken || pair.playerIds.length > 2) return 'conflict'
      pair.playerIds.push(playerId)
      return 'ok'
    },
    startTurn: async ({pairId, playerId, questionId, expire}) => {
      const roundId = snapshot.pairs.find((p) => p.id === pairId)?.roundId
      const round = snapshot.rounds.find((r) => r.id === roundId)
      if (!roundId || round?.status !== 'live') return 'conflict'
      for (const e of expire) {
        const turn = snapshot.turns.find((t) => t.id === e.turnId)
        if (turn && turn.finishedAt === null) turn.finishedAt = e.finishedAt
      }
      const turns = snapshot.turns.filter((t) => t.pairId === pairId)
      if (turns.some((t) => t.finishedAt === null || t.playerId === playerId)) return 'conflict'
      snapshot.turns.push({
        id: nextId('turn'),
        pairId,
        roundId,
        playerId,
        questionId,
        startedAt: clock,
        finishedAt: null,
        questionVote: null,
      })
      return 'ok'
    },
    finishTurn: async ({turnId, finishedAt}) => {
      const turn = snapshot.turns.find((t) => t.id === turnId)
      if (turn && turn.finishedAt === null) turn.finishedAt = finishedAt
    },
    claimTranscription: async (turnId) => {
      if (transcribed.has(turnId)) return false
      transcribed.add(turnId)
      return true
    },
    releaseTranscription: async (turnId) => {
      transcribed.delete(turnId)
    },
    voteQuestion: async ({turnId, vote}) => {
      const turn = snapshot.turns.find((t) => t.id === turnId)
      if (turn) turn.questionVote = vote
    },
    saveResponse: async (input) => {
      const turn = snapshot.turns.find((t) => t.id === input.turnId)
      const existing = responses.findIndex((r) => r.turnId === input.turnId)
      const record: StoredResponse = {
        id: existing === -1 ? nextId('response') : (responses[existing]?.id ?? ''),
        turnId: input.turnId,
        questionId: turn?.questionId ?? '',
        language: input.language,
        transcript: input.transcript,
        durationMs: input.durationMs,
        createdAt: clock,
        playerId: input.playerId,
        deletedAt: null,
      }
      if (existing === -1) responses.push(record)
      else responses[existing] = record
    },
    listResponses: async (playerId) =>
      responses
        .filter((r) => r.playerId === playerId && r.deletedAt === null)
        .map(({playerId: _p, deletedAt: _d, ...r}) => r),
    deleteResponse: async ({responseId, playerId}) => {
      const r = responses.find((x) => x.id === responseId && x.playerId === playerId)
      if (!r || r.deletedAt !== null) return false
      r.deletedAt = clock
      r.transcript = ''
      return true
    },
    saveFeedback: async ({playerId, rating, text}) => {
      feedback.set(playerId, {rating, text})
    },
  }

  return {
    port,
    feedback,
    advance: (ms: number) => {
      clock += ms
    },
    snapshot,
  }
}
