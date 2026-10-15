import type {GameSnapshot, Pair, Player, Round, Turn} from './model'

export const player = (id: string, extra: Partial<Player> = {}): Player => ({
  id,
  gameId: 'g1',
  name: id.toUpperCase(),
  language: 'en',
  pairCode: `C${id.toUpperCase()}`,
  email: null,
  consentTranscript: false,
  consentRecap: false,
  joinedAt: 0,
  ...extra,
})

export const round = (extra: Partial<Round> = {}): Round => ({
  id: 'r1',
  gameId: 'g1',
  n: 1,
  deckSlug: 'library',
  questionPlan: null,
  turnSeconds: 60,
  oddRule: 'trio',
  overtime: 'nudge',
  overtimeSeconds: 30,
  status: 'live',
  startedAt: 0,
  endsAt: null,
  ...extra,
})

export const pair = (id: string, playerIds: string[], roundId = 'r1'): Pair => ({
  id,
  roundId,
  playerIds,
})

export const turn = (extra: Partial<Turn> & Pick<Turn, 'id' | 'pairId' | 'playerId'>): Turn => ({
  roundId: 'r1',
  questionId: 'q1',
  startedAt: 0,
  finishedAt: null,
  questionVote: null,
  ...extra,
})

export const snapshot = (extra: Partial<GameSnapshot> = {}): GameSnapshot => ({
  game: {id: 'g1', code: 'ABCD', title: 'Workshop', status: 'live', settings: {round: {}}},
  players: ['a', 'b', 'c', 'd'].map((id) => player(id)),
  rounds: [round()],
  pairs: [],
  turns: [],
  ...extra,
})
