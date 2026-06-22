import {shouldRecordAnswers} from '@whocards/api/recording'

import {trpc} from '@/lib/trpc'

import type {AnswerEvent, SendAnswer} from '@/lib/answer-queue'

/**
 * The single seam between the offline queue and tRPC: sends one {@link AnswerEvent}
 * to the `answers.record` mutation. Isolated here so the queue stays transport-
 * agnostic.
 *
 * Gated by the shared recording policy (@whocards/api): a dev build skips the send
 * so local play never pollutes the real Answer record, unless
 * `EXPO_PUBLIC_RECORD_ANSWERS=true`. Resolving (rather than throwing) lets the
 * queue drain a deliberately-skipped event instead of retrying it forever.
 */
export const send: SendAnswer = async (event: AnswerEvent): Promise<void> => {
  const optIn = process.env.EXPO_PUBLIC_RECORD_ANSWERS === 'true'
  if (!shouldRecordAnswers({dev: __DEV__, optIn})) return
  await trpc.answers.record.mutate(event)
}
