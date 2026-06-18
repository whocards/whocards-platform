import {z} from 'zod'

import {createTRPCRouter, publicProcedure} from '../trpc'

export const answersRouter = createTRPCRouter({
  /**
   * Record one Answer (CONTEXT.md → Answer record): the Device answered a
   * Question. Validates the event, then hands it to the host's `recordAnswer`
   * port (the Drizzle adapter in apps/website). `type` defaults to `'answered'`,
   * today's only kind (a future dwell-timer / Skip may add others).
   */
  record: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        deckSlug: z.string().min(1),
        questionId: z.string().min(1),
        language: z.string().min(1),
        type: z.string().min(1).default('answered'),
      })
    )
    .mutation(async ({ctx, input}) => {
      await ctx.recordAnswer(input)
    }),
})
