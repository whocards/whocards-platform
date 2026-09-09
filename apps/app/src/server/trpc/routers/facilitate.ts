import {eq} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {ensureAiAtWorkDeck} from '../../decks/bootstrap'
import {db} from '../../db'
import {deck, deckQuestion, questionReview} from '../../db/schema'
import {getEntitlement} from '../../entitlements'
import {createTRPCRouter, entitledProcedure, protectedProcedure} from '../trpc'
import {DECK_SLUG, shippedTextFor} from './question-review'

/** The Access tier (CONTEXT.md glossary) Facilitator Mode sits behind — the
 *  recurring, run-sessions-with-your-team feature is the `subscription` tier
 *  (Tier 2, "WhoCards for Teams"), not a one-time `unlock`. See
 *  server/entitlements.ts for what this resolves to today (everything
 *  granted, `early_access` — no billing exists yet). */
const FACILITATE_TIER = 'subscription' as const

/**
 * Facilitator Mode (issue #221) — deck-agnostic timed session runner. Open to
 * any provisioned member (`protectedProcedure`/`entitledProcedure`, no
 * `roleProcedure` rank check): running a live session with your team isn't a
 * content-review action like the rest of `decks`/`questionReview`, so it
 * isn't gated by ROLE_RANK. The real gate is the paid entitlement, enforced
 * on every procedure below (not just the client's picker) so a direct API
 * call can't route around the locked/upsell UI.
 *
 * No session state is persisted server-side: a session is an ephemeral,
 * client-driven walk through a snapshot of the roster (timer, current index,
 * pause) — there is nothing here to record or resume. If Avi later wants
 * resumable/co-facilitated sessions, that's a new `facilitate_session` table,
 * not a change to these two read procedures.
 */
export const facilitateRouter = createTRPCRouter({
  /** Cheap status check the UI queries first, so the picker can render a
   *  clean locked/upsell screen as data (never a thrown error to catch) —
   *  mirrors discussionAgentRouter.status's enabled-flag pattern. */
  entitlement: protectedProcedure.query(() => getEntitlement(FACILITATE_TIER)),

  /** Decks with at least one question, for the deck picker. Deliberately not
   *  filtered by deck.status (draft/in_review/approved/shipped): that
   *  pipeline governs whether a question's *text* is finalized for shipping,
   *  not whether a team can run a live session on it today — the one deck
   *  that exists right now (`ai-at-work`) is still `in_review`. Revisit if
   *  Avi wants Facilitator Mode restricted to `shipped` decks only. */
  decks: entitledProcedure(FACILITATE_TIER).query(async () => {
    await ensureAiAtWorkDeck()

    const [decks, roster] = await Promise.all([
      db.select().from(deck),
      db
        .select({deckSlug: deckQuestion.deckSlug, actLabel: deckQuestion.actLabel})
        .from(deckQuestion),
    ])

    return decks
      .map((row) => {
        const rows = roster.filter((r) => r.deckSlug === row.slug)
        return {
          slug: row.slug,
          title: row.title,
          description: row.description,
          totalQuestions: rows.length,
          totalActs: new Set(rows.map((r) => r.actLabel)).size,
        }
      })
      .filter((d) => d.totalQuestions > 0)
      .toSorted((a, b) => a.title.localeCompare(b.title))
  }),

  /** The full, ordered, act-labeled roster for one deck, text resolved the
   *  same way question-review.ts's `variants` does — approved/current review
   *  text, falling back to the shipped baseline for ai-at-work's legacy
   *  not-yet-reviewed questions. Returns everything (not dose-limited): the
   *  client slices it with facilitate-logic.ts's `buildSessionQueue`, the
   *  same function that drives the picker's dose-count preview, so there's
   *  one place the dose model lives, not two. */
  roster: entitledProcedure(FACILITATE_TIER)
    .input(z.object({deckSlug: z.string().min(1)}))
    .query(async ({input}) => {
      if (input.deckSlug === DECK_SLUG) await ensureAiAtWorkDeck()

      const [deckRow] = await db.select().from(deck).where(eq(deck.slug, input.deckSlug)).limit(1)
      if (!deckRow) {
        throw new TRPCError({code: 'NOT_FOUND', message: `No deck "${input.deckSlug}".`})
      }

      const [roster, reviews] = await Promise.all([
        db
          .select()
          .from(deckQuestion)
          .where(eq(deckQuestion.deckSlug, input.deckSlug))
          .orderBy(deckQuestion.sortOrder, deckQuestion.id),
        db.select().from(questionReview).where(eq(questionReview.deckSlug, input.deckSlug)),
      ])
      const reviewByQuestion = new Map(reviews.map((r) => [r.questionId, r]))

      return {
        deckSlug: deckRow.slug,
        deckTitle: deckRow.title,
        questions: roster.map((entry) => ({
          questionId: entry.questionId,
          actLabel: entry.actLabel,
          text:
            reviewByQuestion.get(entry.questionId)?.currentText ?? shippedTextFor(entry.questionId),
        })),
      }
    }),
})
