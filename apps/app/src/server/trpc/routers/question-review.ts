import {and, eq} from 'drizzle-orm'
import {createTwoFilesPatch} from 'diff'
import {z} from 'zod'

import {db} from '../../db'
import {appUser, questionComment, questionReview, questionVote} from '../../db/schema'
import {createTRPCRouter, roleProcedure} from '../trpc'
import {
  actLabelFor,
  assembleDeck,
  QUESTION_IDS,
  tallyVotesForQuestion,
} from './question-review-logic'

// The 5 candidate variants (PR #144's HITL pick) plus the currently shipped
// baseline. Reaching into apps/website's data dir is a deliberate exception
// (per the overnight app-foundation plan, which names this exact path) rather
// than a new shared package — revisit if more surfaces need these variants.
import aiAtWorkBase from '../../../../../website/src/data/decks/ai-at-work.questions.json'
import aiAtWorkHuman from '../../../../../website/src/data/decks/ai-at-work-human.questions.json'
import aiAtWorkOpen from '../../../../../website/src/data/decks/ai-at-work-open.questions.json'
import aiAtWorkStories from '../../../../../website/src/data/decks/ai-at-work-stories.questions.json'
import aiAtWorkTogether from '../../../../../website/src/data/decks/ai-at-work-together.questions.json'
// The shipped deck (source of truth) — a diff/PR target, per the plan.
import shippedDeck from '../../../../../../packages/decks/src/decks/ai-at-work.questions.json'

export const DECK_SLUG = 'ai-at-work'

export const VARIANTS = {
  'ai-at-work': aiAtWorkBase,
  'ai-at-work-human': aiAtWorkHuman,
  'ai-at-work-open': aiAtWorkOpen,
  'ai-at-work-stories': aiAtWorkStories,
  'ai-at-work-together': aiAtWorkTogether,
} as const

export type VariantSlug = keyof typeof VARIANTS

const shippedTextFor = (questionId: string): string =>
  (shippedDeck as Record<string, {en: string}>)[questionId]?.en ?? ''

/** `reviewer+` can view/comment/vote (the plan's "facilitator+ can review" reads
 *  as the approve action below — reviewer is the named role for this surface). */
export const questionReviewRouter = createTRPCRouter({
  variants: roleProcedure('reviewer').query(async () => {
    const [reviews, votes] = await Promise.all([
      db.select().from(questionReview).where(eq(questionReview.deckSlug, DECK_SLUG)),
      db.select().from(questionVote).where(eq(questionVote.deckSlug, DECK_SLUG)),
    ])
    const reviewByQuestion = new Map(reviews.map((r) => [r.questionId, r]))

    return QUESTION_IDS.map((questionId) => {
      const variantTexts = Object.fromEntries(
        Object.entries(VARIANTS).map(([slug, deck]) => [
          slug,
          (deck as Record<string, {en: string}>)[questionId]?.en ?? '',
        ])
      ) as Record<VariantSlug, string>

      const review = reviewByQuestion.get(questionId)
      return {
        questionId,
        actLabel: actLabelFor(questionId),
        shippedText: shippedTextFor(questionId),
        variants: variantTexts,
        voteTally: tallyVotesForQuestion(votes, questionId),
        review: review
          ? {
              status: review.status,
              currentText: review.currentText,
              proposedEdit: review.proposedEdit,
              decidedBy: review.decidedBy,
              decidedAt: review.decidedAt,
            }
          : null,
      }
    })
  }),

  myVotes: roleProcedure('reviewer').query(async ({ctx}) => {
    const votes = await db
      .select()
      .from(questionVote)
      .where(and(eq(questionVote.deckSlug, DECK_SLUG), eq(questionVote.voterId, ctx.user.id)))
    return Object.fromEntries(votes.map((v) => [v.questionId, v.variant as VariantSlug]))
  }),

  vote: roleProcedure('reviewer')
    .input(
      z.object({questionId: z.enum(QUESTION_IDS as [string, ...string[]]), variant: z.string()})
    )
    .mutation(async ({ctx, input}) => {
      await db
        .insert(questionVote)
        .values({
          deckSlug: DECK_SLUG,
          questionId: input.questionId,
          voterId: ctx.user.id,
          variant: input.variant,
        })
        .onConflictDoUpdate({
          target: [questionVote.deckSlug, questionVote.questionId, questionVote.voterId],
          set: {variant: input.variant, updatedAt: new Date()},
        })
    }),

  comments: createTRPCRouter({
    list: roleProcedure('reviewer')
      .input(z.object({questionId: z.string()}))
      .query(async ({input}) =>
        db
          .select({
            id: questionComment.id,
            body: questionComment.body,
            createdAt: questionComment.createdAt,
            authorEmail: appUser.email,
          })
          .from(questionComment)
          .innerJoin(appUser, eq(questionComment.authorId, appUser.id))
          .where(
            and(
              eq(questionComment.deckSlug, DECK_SLUG),
              eq(questionComment.questionId, input.questionId)
            )
          )
      ),
    add: roleProcedure('reviewer')
      .input(z.object({questionId: z.string(), body: z.string().min(1).max(2000)}))
      .mutation(async ({ctx, input}) => {
        await db.insert(questionComment).values({
          deckSlug: DECK_SLUG,
          questionId: input.questionId,
          authorId: ctx.user.id,
          body: input.body,
        })
      }),
  }),

  /** facilitator+ finalizes a question's text (the plan's "approve one"). */
  approve: roleProcedure('facilitator')
    .input(z.object({questionId: z.string(), text: z.string().min(1)}))
    .mutation(async ({ctx, input}) => {
      const [existing] = await db
        .select()
        .from(questionReview)
        .where(
          and(
            eq(questionReview.deckSlug, DECK_SLUG),
            eq(questionReview.questionId, input.questionId)
          )
        )
        .limit(1)

      if (existing) {
        const [updated] = await db
          .update(questionReview)
          .set({
            status: 'approved',
            currentText: input.text,
            decidedBy: ctx.user.id,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(questionReview.id, existing.id))
          .returning()
        return updated
      }

      const [created] = await db
        .insert(questionReview)
        .values({
          deckSlug: DECK_SLUG,
          questionId: input.questionId,
          status: 'approved',
          currentText: input.text,
          decidedBy: ctx.user.id,
          decidedAt: new Date(),
        })
        .returning()
      return created
    }),

  /** Assembles the 37-question deck (approved text where decided, the shipped
   *  baseline everywhere else) and emits a unified diff against the shipped
   *  packages/decks JSON — git stays the source of truth; this never writes to
   *  the repo itself (see the plan's guardrails). */
  emitDiff: roleProcedure('facilitator').query(async () => {
    const reviews = await db
      .select()
      .from(questionReview)
      .where(eq(questionReview.deckSlug, DECK_SLUG))
    const approvedText = new Map(
      reviews.filter((r) => r.status === 'approved').map((r) => [r.questionId, r.currentText])
    )
    const assembled = assembleDeck(shippedTextFor, approvedText)

    const targetPath = 'packages/decks/src/decks/ai-at-work.questions.json'
    const patch = createTwoFilesPatch(
      targetPath,
      targetPath,
      `${JSON.stringify(shippedDeck, null, 2)}\n`,
      `${JSON.stringify(assembled, null, 2)}\n`
    )

    return {
      patch,
      proposedJson: `${JSON.stringify(assembled, null, 2)}\n`,
      approvedCount: approvedText.size,
      totalCount: QUESTION_IDS.length,
    }
  }),
})
