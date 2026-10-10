import type {GameLanguage, GameSnapshot, HostedGame, Player, ResponseRecord} from '@whocards/game'

/** A write the database refused on a uniqueness rule, i.e. someone else got there first. */
export type WriteResult = 'ok' | 'conflict'

/** Hosted-game persistence (ADR-0002): snapshot reads plus narrow writes; DB constraints settle races. */
export type GamePort = {
  now: () => number
  /** [0, 1); crypto-backed in production so question draws aren't guessable. */
  random: () => number
  findGameByCode: (code: string) => Promise<HostedGame | null>
  findPlayerByToken: (token: string) => Promise<Player | null>
  /** Mints the bearer token and a pair code unique within the game. */
  createPlayer: (input: {
    gameId: string
    name: string
    language: GameLanguage
    email: string | null
    consentTranscript: boolean
    consentRecap: boolean
  }) => Promise<{player: Player; token: string}>
  loadSnapshot: (gameId: string) => Promise<GameSnapshot | null>
  createPair: (input: {roundId: string; playerIds: [string, string]}) => Promise<WriteResult>
  /** Takes the pair's lowest free slot; a slot freed by a removed player is reused. */
  addToPair: (input: {pairId: string; roundId: string; playerId: string}) => Promise<WriteResult>
  /** Closes `expire` (still-open, timed-out turns) then opens the new turn, atomically; conflict once the round is no longer live. */
  startTurn: (input: {
    pairId: string
    playerId: string
    questionId: string
    startedAt: number
    expire: Array<{turnId: string; finishedAt: number}>
  }) => Promise<WriteResult>
  /** No-op if the turn is already finished. */
  finishTurn: (input: {turnId: string; finishedAt: number}) => Promise<void>
  /** One response per turn; saving again replaces it. */
  saveResponse: (input: {
    turnId: string
    playerId: string
    language: GameLanguage
    transcript: string
    durationMs: number
  }) => Promise<void>
  /** Live (not deleted) responses, oldest first. */
  listResponses: (playerId: string) => Promise<ResponseRecord[]>
  /** Soft-deletes and wipes the transcript; false if it isn't this player's live response. */
  deleteResponse: (input: {responseId: string; playerId: string}) => Promise<boolean>
  /** One feedback per player; sending again replaces it. */
  saveFeedback: (input: {
    gameId: string
    playerId: string
    rating: number
    text: string | null
  }) => Promise<void>
}
