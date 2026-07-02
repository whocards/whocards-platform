/**
 * The Game vocabulary (see CONTEXT.md "Game"). Global/Personal (ADR-0004) are
 * answered-set *scopes*, not new game ids — only draw-ritual variants earn an id.
 */
export const GAME_IDS = ['wh', 'pick'] as const
export type GameId = (typeof GAME_IDS)[number]
export const DEFAULT_GAME: GameId = 'wh'
export const isGameId = (value: string): value is GameId =>
  (GAME_IDS as readonly string[]).includes(value)
