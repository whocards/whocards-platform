import type {
  GameLanguage,
  GameSettings,
  GameStatus,
  OddRule,
  Overtime,
  QuestionPlan,
  QuestionVote,
  RoundStatus,
} from './schemas'

// Host-neutral records the rules run on. Adapters map DB rows to these; timestamps are epoch ms.

export type HostedGame = {
  id: string
  code: string
  title: string
  status: GameStatus
  settings: GameSettings
}

export type Player = {
  id: string
  gameId: string
  name: string
  language: GameLanguage
  pairCode: string
  email: string | null
  consentTranscript: boolean
  consentRecap: boolean
  joinedAt: number
}

export type Round = {
  id: string
  gameId: string
  n: number
  /** The random source, or the first fixed pick's source; resolves bare ids on pre-plan turns. */
  deckSlug: string
  /** Null on rounds made before plans: random from `deckSlug`. */
  questionPlan: QuestionPlan | null
  turnSeconds: number
  oddRule: OddRule
  overtime: Overtime
  overtimeSeconds: number
  status: RoundStatus
  startedAt: number | null
  endsAt: number | null
}

export type Pair = {
  id: string
  roundId: string
  /** In join order; a third id means a trio. */
  playerIds: string[]
}

export type Turn = {
  id: string
  pairId: string
  /** Denormalised from the pair so a turn still resolves after its pair members leave. */
  roundId: string
  playerId: string
  /** A question ref; turns from before question plans hold a bare id from the round's deck. */
  questionId: string
  startedAt: number
  finishedAt: number | null
  questionVote: QuestionVote | null
}

/** Everything about one game the rules need, minus response content. */
export type GameSnapshot = {
  game: HostedGame
  players: Player[]
  rounds: Round[]
  pairs: Pair[]
  turns: Turn[]
}

export type ResponseRecord = {
  id: string
  turnId: string
  questionId: string
  language: GameLanguage
  transcript: string
  durationMs: number
  createdAt: number
}
