import {shouldRecordAnswers} from '@whocards/api/recording'

import type {AnswerEvent} from './answer-event'
import type {Send} from './offline-queue'
import {trpc} from './trpc'

/**
 * The single seam between the offline queue and tRPC: sends one Answer event to
 * the `answers.record` mutation. Everything else in the web slice is decoupled —
 * the queue only knows this `send`.
 *
 * Gated by the shared recording policy (@whocards/api): in dev the send is skipped
 * so local play never pollutes the real Answer record, unless
 * `PUBLIC_RECORD_ANSWERS=true`. Resolving (not throwing) lets the queue drain.
 */
export const sendAnswer: Send = async (event: AnswerEvent): Promise<void> => {
  const optIn = import.meta.env.PUBLIC_RECORD_ANSWERS === 'true'
  if (!shouldRecordAnswers({dev: import.meta.env.DEV, optIn})) return
  await trpc.answers.record.mutate(event)
}
