import {eq} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {ensureAiAtWorkDeck} from '../../decks/bootstrap'
import {db} from '../../db'
import {deck, deckQuestion, questionReview} from '../../db/schema'
import {createTRPCRouter, roleProcedure} from '../trpc'
import {
  buildNewQuestion,
  canTransitionDeckStatus,
  DECK_STATUSES,
  DECKS_MIN_ROLE,
  isDeckStatus,
} from './decks-logic'
import type {DeckStatus} from './decks-logic'
import {DECK_SLUG} from './question-review-logic'

const deckStatusSchema = z.enum(DECK_STATUSES)

/** DB is the source of truth for `status`; a value outside DECK_STATUSES means
 *  corrupt data, not a type-level concern — surface it loudly instead of casting. */
const toDeckStatus = (status: string): DeckStatus => {
  if (!isDeckStatus(status)) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Corrupt deck status "${status}".`,
    })
  }
  return status
}

/**
 * Deck overview + roster management (RBAC per the founder brief: reviewer
 * views, facilitator manages status + adds questions). Review workflow
 * (vote/comment/approve/diff) for the questions inside a deck stays in
 * question-review.ts, unchanged — this router only owns the `deck` /
 * `deck_question` tables.
 */
export const decksRouter = createTRPCRouter({
  /** Decks overview: one row per deck with approve/total counts, for the
   *  "grouped by status" landing page. */
  list: roleProcedure(DECKS_MIN_ROLE.view).query(async () => {
    await ensureAiAtWorkDeck()

    const [decks, roster, reviews] = await Promise.all([
      db.select().from(deck),
      db.select().from(deckQuestion),
      db.select().from(questionReview),
    ])
    const approvedStatusByKey = new Map(
      reviews
        .filter((r) => r.status === 'approved')
        .map((r) => [`${r.deckSlug}:${r.questionId}`, true])
    )

    return decks
      .map((row) => {
        const questions = roster.filter((q) => q.deckSlug === row.slug)
        const approvedQuestions = questions.filter((q) =>
          approvedStatusByKey.has(`${row.slug}:${q.questionId}`)
        ).length
        return {
          slug: row.slug,
          title: row.title,
          description: row.description,
          status: toDeckStatus(row.status),
          totalQuestions: questions.length,
          approvedQuestions,
          updatedAt: row.updatedAt,
        }
      })
      .toSorted((a, b) => a.title.localeCompare(b.title))
  }),

  /** Deck-detail header (title/description/status + whether it's the one deck
   *  with a shippable JSON to diff against — see question-review.ts's
   *  emitDiff and the app's "git stays the source of truth" guardrail). */
  get: roleProcedure(DECKS_MIN_ROLE.view)
    .input(z.object({slug: z.string().min(1)}))
    .query(async ({input}) => {
      if (input.slug === DECK_SLUG) await ensureAiAtWorkDeck()

      const [row] = await db.select().from(deck).where(eq(deck.slug, input.slug)).limit(1)
      if (!row) throw new TRPCError({code: 'NOT_FOUND', message: `No deck "${input.slug}".`})

      return {
        slug: row.slug,
        title: row.title,
        description: row.description,
        status: toDeckStatus(row.status),
        canEmitDiff: row.slug === DECK_SLUG,
      }
    }),

  /** facilitator+ moves a deck one step forward or back in its review
   *  pipeline (see decks-logic.ts's canTransitionDeckStatus). */
  updateStatus: roleProcedure(DECKS_MIN_ROLE.updateStatus)
    .input(z.object({slug: z.string().min(1), status: deckStatusSchema}))
    .mutation(async ({input}) => {
      const [row] = await db.select().from(deck).where(eq(deck.slug, input.slug)).limit(1)
      if (!row) throw new TRPCError({code: 'NOT_FOUND', message: `No deck "${input.slug}".`})

      const from = toDeckStatus(row.status)
      if (!canTransitionDeckStatus(from, input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Can't move a deck from "${from}" straight to "${input.status}" — one step at a time.`,
        })
      }

      const [updated] = await db
        .update(deck)
        .set({status: input.status, updatedAt: new Date()})
        .where(eq(deck.id, row.id))
        .returning()
      return updated
    }),

  /** facilitator+ adds a new question to a deck's roster, with an initial
   *  question_review row so it's immediately visible/voteable/approvable —
   *  see decks-logic.ts's buildNewQuestion for the shape decision. */
  addQuestion: roleProcedure(DECKS_MIN_ROLE.addQuestion)
    .input(
      z.object({
        deckSlug: z.string().min(1),
        actLabel: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(2000),
      })
    )
    .mutation(async ({ctx, input}) => {
      const [row] = await db.select().from(deck).where(eq(deck.slug, input.deckSlug)).limit(1)
      if (!row) throw new TRPCError({code: 'NOT_FOUND', message: `No deck "${input.deckSlug}".`})

      const existingRoster = await db
        .select({id: deckQuestion.id})
        .from(deckQuestion)
        .where(eq(deckQuestion.deckSlug, input.deckSlug))

      const record = buildNewQuestion(
        input,
        () => crypto.randomUUID().slice(0, 8),
        existingRoster.length
      )

      // Both inserts (the roster row + its initial review row) succeed or fail
      // together — without this, a failure on the second insert would orphan a
      // roster row with no review row, which renders as a blank-text question
      // (variantTexts falls back to `{current: ''}` in question-review.ts).
      const created = await db.transaction(async (tx) => {
        await tx.insert(deckQuestion).values({...record.deckQuestion, createdBy: ctx.user.id})
        const [createdReview] = await tx
          .insert(questionReview)
          .values(record.questionReview)
          .returning()
        return createdReview
      })
      return created
    }),
})
