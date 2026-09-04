import {and, eq} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {createTwoFilesPatch} from 'diff'
import {z} from 'zod'

import {ensureAiAtWorkDeck, ensureLibraryDeck} from '../../decks/bootstrap'
import {LIBRARY_DECK} from '../../decks/bootstrap-logic'
import {db} from '../../db'
import {appUser, deckQuestion, questionComment, questionReview, questionVote} from '../../db/schema'
import {createTRPCRouter, roleProcedure} from '../trpc'
import {assembleDeck, DECK_SLUG, QUESTION_IDS, tallyVotesForQuestion} from './question-review-logic'

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

// Re-exported for existing import sites (discussion-agent.ts) — the constant
// itself now lives in question-review-logic.ts (a DB-free module) so route
// files / decks.ts can use it without pulling in Drizzle.
export {DECK_SLUG}

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

/** True for the 37 questions imported from PR #144's variant pick — these have
 *  5 parallel wordings to vote on (see VARIANTS above). Any other question
 *  (added via decks.ts's `addQuestion`) has exactly one wording, keyed
 *  `'current'` — see decks-logic.ts's `buildNewQuestion` for that decision. */
const hasLegacyVariants = (questionId: string): boolean =>
  (QUESTION_IDS as readonly string[]).includes(questionId)

/**
 * Guards vote/comments.add/approve against a client-supplied (deckSlug,
 * questionId) that isn't real. Both became free-form strings (not the old
 * hardcoded 37-id enum) once decks became a first-class concept — without
 * this, a typo'd or stale id would silently write an orphan vote/comment/
 * approval row with nothing to attach to. Checked against deck_question (the
 * roster table) rather than `deck` directly: deckQuestion.deckSlug already
 * has a real FK into `deck` (see schema.ts), so a roster hit implies the
 * parent deck exists too — one query covers both.
 */
async function assertQuestionOnDeck(deckSlug: string, questionId: string): Promise<void> {
  const [row] = await db
    .select({id: deckQuestion.id})
    .from(deckQuestion)
    .where(and(eq(deckQuestion.deckSlug, deckSlug), eq(deckQuestion.questionId, questionId)))
    .limit(1)
  if (!row) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No question "${questionId}" on deck "${deckSlug}".`,
    })
  }
}

/** `reviewer+` can view/comment/vote (the plan's "facilitator+ can review" reads
 *  as the approve action below — reviewer is the named role for this surface).
 *  Every procedure here is deck-scoped (`deckSlug` input) now that decks are a
 *  first-class concept (decks.ts) — the ai-at-work deck is just the one deck
 *  seeded tonight, not a hardcoded assumption. */
export const questionReviewRouter = createTRPCRouter({
  variants: roleProcedure('reviewer')
    .input(z.object({deckSlug: z.string().min(1)}))
    .query(async ({input}) => {
      if (input.deckSlug === DECK_SLUG) await ensureAiAtWorkDeck()
      else if (input.deckSlug === LIBRARY_DECK.slug) await ensureLibraryDeck()

      const [roster, reviews, votes] = await Promise.all([
        db
          .select()
          .from(deckQuestion)
          .where(eq(deckQuestion.deckSlug, input.deckSlug))
          .orderBy(deckQuestion.sortOrder, deckQuestion.id),
        db.select().from(questionReview).where(eq(questionReview.deckSlug, input.deckSlug)),
        db.select().from(questionVote).where(eq(questionVote.deckSlug, input.deckSlug)),
      ])
      const reviewByQuestion = new Map(reviews.map((r) => [r.questionId, r]))

      return roster.map((entry) => {
        const review = reviewByQuestion.get(entry.questionId)
        const variantTexts: Record<string, string> = hasLegacyVariants(entry.questionId)
          ? Object.fromEntries(
              Object.entries(VARIANTS).map(([slug, deckData]): [string, string] => [
                slug,
                (deckData as Record<string, {en: string}>)[entry.questionId]?.en ?? '',
              ])
            )
          : {current: review?.currentText ?? ''}

        return {
          questionId: entry.questionId,
          actLabel: entry.actLabel,
          shippedText: shippedTextFor(entry.questionId),
          variants: variantTexts,
          voteTally: tallyVotesForQuestion(votes, entry.questionId),
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

  myVotes: roleProcedure('reviewer')
    .input(z.object({deckSlug: z.string().min(1)}))
    .query(async ({ctx, input}) => {
      const votes = await db
        .select()
        .from(questionVote)
        .where(
          and(eq(questionVote.deckSlug, input.deckSlug), eq(questionVote.voterId, ctx.user.id))
        )
      return Object.fromEntries(votes.map((v): [string, string] => [v.questionId, v.variant]))
    }),

  vote: roleProcedure('reviewer')
    .input(
      z.object({
        deckSlug: z.string().min(1),
        questionId: z.string().min(1),
        variant: z.string().min(1),
      })
    )
    .mutation(async ({ctx, input}) => {
      await assertQuestionOnDeck(input.deckSlug, input.questionId)

      await db
        .insert(questionVote)
        .values({
          deckSlug: input.deckSlug,
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
      .input(z.object({deckSlug: z.string().min(1), questionId: z.string().min(1)}))
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
              eq(questionComment.deckSlug, input.deckSlug),
              eq(questionComment.questionId, input.questionId)
            )
          )
      ),
    add: roleProcedure('reviewer')
      .input(
        z.object({
          deckSlug: z.string().min(1),
          questionId: z.string().min(1),
          body: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ctx, input}) => {
        await assertQuestionOnDeck(input.deckSlug, input.questionId)

        await db.insert(questionComment).values({
          deckSlug: input.deckSlug,
          questionId: input.questionId,
          authorId: ctx.user.id,
          body: input.body,
        })
      }),
  }),

  /** facilitator+ finalizes a question's text (the plan's "approve one"). */
  approve: roleProcedure('facilitator')
    .input(
      z.object({
        deckSlug: z.string().min(1),
        questionId: z.string().min(1),
        text: z.string().min(1),
      })
    )
    .mutation(async ({ctx, input}) => {
      await assertQuestionOnDeck(input.deckSlug, input.questionId)

      const [existing] = await db
        .select()
        .from(questionReview)
        .where(
          and(
            eq(questionReview.deckSlug, input.deckSlug),
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
          deckSlug: input.deckSlug,
          questionId: input.questionId,
          status: 'approved',
          currentText: input.text,
          decidedBy: ctx.user.id,
          decidedAt: new Date(),
        })
        .returning()
      return created
    }),

  /** Assembles the ai-at-work deck (approved text where decided, the shipped
   *  baseline everywhere else) and emits a unified diff against the shipped
   *  packages/decks JSON — git stays the source of truth; this never writes to
   *  the repo itself (see the plan's guardrails). Deliberately ai-at-work-only
   *  (no deckSlug input): it's the one deck with a shippable JSON file today
   *  (see decks.ts's `canEmitDiff`) — the question roster is read live from
   *  `deck_question` (not the static 37-id list) so a question added to this
   *  deck via decks.ts's addQuestion flows into the diff too. */
  emitDiff: roleProcedure('facilitator').query(async () => {
    await ensureAiAtWorkDeck()

    const [roster, reviews] = await Promise.all([
      db
        .select({questionId: deckQuestion.questionId})
        .from(deckQuestion)
        .where(eq(deckQuestion.deckSlug, DECK_SLUG))
        .orderBy(deckQuestion.sortOrder, deckQuestion.id),
      db.select().from(questionReview).where(eq(questionReview.deckSlug, DECK_SLUG)),
    ])
    const questionIds = roster.map((r) => r.questionId)
    const approvedText = new Map(
      reviews.filter((r) => r.status === 'approved').map((r) => [r.questionId, r.currentText])
    )
    const assembled = assembleDeck(shippedTextFor, approvedText, questionIds)

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
      totalCount: questionIds.length,
    }
  }),
})
