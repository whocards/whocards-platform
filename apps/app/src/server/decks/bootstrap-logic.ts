// Pure logic for bootstrap.ts's library-deck seed, split out so it's testable
// without a database — same split as decks-logic.ts / question-review-logic.ts.
// bootstrap.ts wires this up to Drizzle inserts.

import {libraryDeck, resolveDeck} from '@whocards/decks'
import type {ResolvedDeck} from '@whocards/decks'

/**
 * The classic/original WhoCards conversation deck (issue #222) — 66
 * multi-language questions, no acts/categories of its own, backed by
 * @whocards/decks' Pool (packages/decks/src/pool/questions.json). Of the
 * three decks the package ships (library, hajnalig, ai-at-work), this is the
 * one that's unambiguously "the old deck": hajnalig is a one-off event deck
 * and ai-at-work is already the app's first deck — library is THE original
 * WhoCards conversation deck every other surface (web, mobile) calls the
 * default `/play` experience.
 *
 * Resolved once at module load. @whocards/decks stays the source of truth —
 * nothing here forks its content; this just reads it into a shape the
 * deck/deckQuestion/questionReview tables can seed from (bootstrap.ts).
 */
export const LIBRARY_DECK: ResolvedDeck = resolveDeck(libraryDeck)

/**
 * deckQuestion roster rows group by `actLabel` (see decks-logic.ts's
 * groupByAct) — ai-at-work has 4 acts (question-review-logic.ts's ACTS), but
 * the library deck is one flat, unsectioned list of questions, so every row
 * shares this single label.
 */
export const LIBRARY_ACT_LABEL = 'Questions'

export type LibraryDeckQuestionRow = {
  deckSlug: string
  questionId: string
  actLabel: string
  sortOrder: number
}

export type LibraryQuestionReviewRow = {
  deckSlug: string
  questionId: string
  status: 'approved'
  currentText: string
}

/**
 * Shapes the full deckQuestion roster for `deck`, in its @whocards/decks
 * order (pool order — ascending numeric id). Pure — bootstrap.ts filters this
 * down to whatever isn't already seeded before inserting (idempotent).
 */
export const buildLibraryRoster = (deck: ResolvedDeck): LibraryDeckQuestionRow[] =>
  deck.questionIds.map((questionId, sortOrder) => ({
    deckSlug: deck.slug,
    questionId,
    actLabel: LIBRARY_ACT_LABEL,
    sortOrder,
  }))

/**
 * Shapes pre-approved questionReview rows carrying `deck`'s shipped English
 * text. Unlike ai-at-work (an active in-app variant-vote/approve workflow —
 * see question-review.ts), this deck ships as-is: there's nothing to review,
 * so every question starts `approved` with its shipped text as currentText —
 * see bootstrap.ts's ensureLibraryDeck doc comment for the full rationale.
 */
export const buildLibraryReviews = (deck: ResolvedDeck): LibraryQuestionReviewRow[] =>
  deck.questionIds.map((questionId) => ({
    deckSlug: deck.slug,
    questionId,
    status: 'approved' as const,
    currentText: deck.questions[questionId]?.en ?? '',
  }))
