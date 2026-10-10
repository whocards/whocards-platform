import {TRPCError} from '@trpc/server'
import {copyFor} from '@whocards/game'
import type {Refusal} from '@whocards/game'

/** Carried as the TRPCError cause so the error formatter can expose `data.refusal`. */
export class GameRefusalError extends Error {
  readonly reason: Refusal

  constructor(reason: Refusal) {
    super(reason)
    this.name = 'GameRefusalError'
    this.reason = reason
  }
}

const NOT_FOUND: ReadonlySet<Refusal> = new Set(['unknown_game', 'unknown_code', 'not_found'])

export const refuse = (reason: Refusal): TRPCError =>
  new TRPCError({
    code: NOT_FOUND.has(reason) ? 'NOT_FOUND' : 'CONFLICT',
    message: copyFor('en').refusals[reason],
    cause: new GameRefusalError(reason),
  })
