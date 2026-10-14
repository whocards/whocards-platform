import type {PlayerState, RoundView, TurnView} from '../schemas'

export const roundView = (extra: Partial<RoundView> = {}): RoundView => ({
  id: 'r1',
  n: 1,
  status: 'live',
  deckSlug: 'library',
  turnSeconds: 60,
  oddRule: 'trio',
  overtime: 'nudge',
  overtimeSeconds: 30,
  startedAt: 0,
  endsAt: null,
  ...extra,
})

export const turnView = (extra: Partial<TurnView> = {}): TurnView => ({
  id: 't1',
  playerId: 'a',
  questionId: 'q1',
  questionText: 'What surprised you this week?',
  answerMode: 'voice',
  startedAt: 0,
  finishedAt: null,
  deadline: 90_000,
  ...extra,
})

export const playerState = (extra: Partial<PlayerState> = {}): PlayerState => ({
  serverNow: 0,
  game: {id: 'g1', code: 'ABCD', title: 'Workshop', organizer: null, status: 'live'},
  me: {id: 'a', name: 'A', language: 'en', pairCode: 'CA'},
  round: roundView(),
  phase: 'unpaired',
  pair: null,
  ...extra,
})

export const speakingState = (turn: Partial<TurnView> = {}): PlayerState => {
  const active = turnView(turn)
  return playerState({
    phase: 'speaking',
    pair: {id: 'p1', partners: [{id: 'b', name: 'B'}], turns: [active], activeTurn: active},
  })
}

export const deferred = <T>() => {
  const settle: {resolve?: (value: T) => void} = {}
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve
  })
  return {promise, resolve: (value: T) => settle.resolve?.(value)}
}

export const trpcError = (data: unknown, message = 'refused') =>
  Object.assign(new Error(message), {data})
