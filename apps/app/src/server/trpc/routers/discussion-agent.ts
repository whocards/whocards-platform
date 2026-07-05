import {and, eq} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {askAgent} from '../../agent/anthropic'
import {db} from '../../db'
import {agentMessage} from '../../db/schema'
import {agentEnabled} from '../../env'
import {createTRPCRouter, roleProcedure} from '../trpc'

// Slice 5 (stretch, per the overnight plan) — reuses the question-lab's
// Anthropic call pattern (server/agent/anthropic.ts) as a per-question
// "discuss with an agent" thread, gated to facilitator+. Degrades gracefully
// (never crashes) when ANTHROPIC_API_KEY is absent — see `status` below, which
// the UI checks before ever showing a compose box. Deck-scoped (`deckSlug`
// input) for the same reason as question-review.ts: decks are now a
// first-class concept, not a hardcoded constant.
export const discussionAgentRouter = createTRPCRouter({
  status: roleProcedure('facilitator').query(() => ({enabled: agentEnabled})),

  messages: createTRPCRouter({
    list: roleProcedure('facilitator')
      .input(z.object({deckSlug: z.string().min(1), questionId: z.string().min(1)}))
      .query(async ({input}) =>
        db
          .select()
          .from(agentMessage)
          .where(
            and(
              eq(agentMessage.deckSlug, input.deckSlug),
              eq(agentMessage.questionId, input.questionId)
            )
          )
          .orderBy(agentMessage.createdAt)
      ),

    send: roleProcedure('facilitator')
      .input(
        z.object({
          deckSlug: z.string().min(1),
          questionId: z.string().min(1),
          questionText: z.string(),
          content: z.string().min(1).max(4000),
        })
      )
      .mutation(async ({ctx, input}) => {
        if (!agentEnabled) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'ANTHROPIC_API_KEY is not set — ask an admin to add it to enable this.',
          })
        }

        const prior = await db
          .select()
          .from(agentMessage)
          .where(
            and(
              eq(agentMessage.deckSlug, input.deckSlug),
              eq(agentMessage.questionId, input.questionId)
            )
          )
          .orderBy(agentMessage.createdAt)

        await db.insert(agentMessage).values({
          deckSlug: input.deckSlug,
          questionId: input.questionId,
          role: 'user',
          content: input.content,
          authorId: ctx.user.id,
        })

        const reply = await askAgent(input.questionText, [
          ...prior.map((m) => ({role: m.role as 'user' | 'assistant', content: m.content})),
          {role: 'user', content: input.content},
        ])

        const [assistantMessage] = await db
          .insert(agentMessage)
          .values({
            deckSlug: input.deckSlug,
            questionId: input.questionId,
            role: 'assistant',
            content: reply,
          })
          .returning()
        return assistantMessage
      }),
  }),
})
