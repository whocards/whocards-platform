import type {AnswerEvent} from './answer-event'
import type {Send} from './offline-queue'
import {trpc} from './trpc'

/**
 * The single seam between the offline queue and tRPC: sends one Answer event to
 * the `answers.record` mutation. Everything else in the web slice is decoupled —
 * the queue only knows this `send`.
 */
export const sendAnswer: Send = async (event: AnswerEvent): Promise<void> => {
  await trpc.answers.record.mutate(event)
}
