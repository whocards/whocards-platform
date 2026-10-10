export * from './adapters'
export * from './copy'
export * from './model'
export * from './pair-code'
export * from './player-copy'
export * from './rules/codes'
export * from './rules/pairing'
export * from './rules/status'
export * from './rules/timer'
export * from './rules/turns'
export * from './schemas'
export * from './views'

/** Player token travels in a header so it never lands in GET query strings or logs. */
export const PLAYER_TOKEN_HEADER = 'x-whocards-player'

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024
