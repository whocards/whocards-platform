import {TRPCError} from '@trpc/server'
import {getAllDecks, getDeck} from '@whocards/decks'
import {z} from 'zod'

import {createTRPCRouter, publicProcedure} from '../trpc'

export const decksRouter = createTRPCRouter({
  /**
   * The Library: every deck's metadata, without question text — small and
   * edge-cacheable, this is what a client renders the browse surface from.
   */
  manifest: publicProcedure.query(() =>
    getAllDecks().map((deck) => ({
      slug: deck.slug,
      title: deck.title,
      description: deck.description,
      languages: deck.languages,
      questionCount: deck.questionIds.length,
    }))
  ),

  /** A single resolved deck — metadata, presentation, and its QuestionSet. */
  bySlug: publicProcedure.input(z.object({slug: z.string().min(1)})).query(({input}) => {
    const deck = getDeck(input.slug)
    if (!deck) {
      throw new TRPCError({code: 'NOT_FOUND', message: `Unknown deck: ${input.slug}`})
    }
    return deck
  }),
})
