import {trpc} from '@/lib/trpc'

import type {AnswerEvent, SendAnswer} from '@/lib/answer-queue'

/**
 * The single seam between the offline queue and tRPC: sends one {@link AnswerEvent}
 * to the `answers.record` mutation. Isolated here so the queue stays transport-
 * agnostic.
 */
export const send: SendAnswer = async (event: AnswerEvent): Promise<void> => {
  await trpc.answers.record.mutate(event)
}
