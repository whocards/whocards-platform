import {z} from 'zod'

import type {Refusal} from '../schemas'
import {refusalSchema} from '../schemas'

export type GameError = {refusal: Refusal | null; unauthorized: boolean; message: string}

const errorShape = z.object({
  message: z.string().catch(''),
  data: z
    .object({
      refusal: refusalSchema.nullish().catch(null),
      code: z.string().optional().catch(undefined),
      httpStatus: z.number().optional().catch(undefined),
    })
    .nullish()
    .catch(null),
})

/** Reads a tRPC-shaped error without trusting its type: refusal, auth, or just a message. */
export const gameErrorOf = (error: unknown): GameError => {
  const parsed = errorShape.safeParse(error)
  if (!parsed.success) return {refusal: null, unauthorized: false, message: String(error)}
  const {message, data} = parsed.data
  return {
    refusal: data?.refusal ?? null,
    unauthorized: data?.code === 'UNAUTHORIZED' || data?.httpStatus === 401,
    message,
  }
}
