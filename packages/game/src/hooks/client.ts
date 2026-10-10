import type {z} from 'zod'

import type {feedbackInputSchema, JoinInput, PlayerState, responseInputSchema} from '../schemas'

export type ResponseInput = z.input<typeof responseInputSchema>
export type FeedbackInput = z.input<typeof feedbackInputSchema>

/** The game API as the hooks see it; each app wires its own transport and keeps the token. */
export type GameClient = {
  join: (input: JoinInput) => Promise<PlayerState>
  state: () => Promise<PlayerState>
  pair: (partnerCode: string) => Promise<PlayerState>
  turn: (action: 'claim' | 'finish') => Promise<PlayerState>
  response: (input: ResponseInput) => Promise<PlayerState>
  feedback: (input: FeedbackInput) => Promise<PlayerState>
}

/** App lifecycle: web maps it to `visibilitychange`, native to `AppState`. */
export type GamePlatform = {
  isForeground: () => boolean
  /** Returns an unsubscribe. */
  onForegroundChange: (callback: (foreground: boolean) => void) => () => void
}
