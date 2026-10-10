import type {
  GameLanguage,
  GameSettings,
  GameStatus,
  OddRule,
  Overtime,
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
}

export type Round = {
  id: string
  gameId: string
  n: number
  deckSlug: string
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
  questionId: string
  startedAt: number
  finishedAt: number | null
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
