import {eq} from 'drizzle-orm'

import {db} from '../db'
import {deck, deckQuestion, questionReview} from '../db/schema'
import {actLabelFor, DECK_SLUG, QUESTION_IDS} from '../trpc/routers/question-review-logic'
import {buildLibraryReviews, buildLibraryRoster, LIBRARY_DECK} from './bootstrap-logic'

// The imported PR #144 deck's display copy — mirrors
// packages/decks/src/decks/ai-at-work.ts's `title`/`description` (hardcoded
// here rather than imported: it's a one-time seed value, not something that
// needs to stay live-synced with the shippable package).
const AI_AT_WORK_TITLE = 'AI Check-In'
const AI_AT_WORK_DESCRIPTION =
  'A 20-minute team check-in for talking honestly about AI at work — the fear, what stays human, and the norms you want to live by.'

/**
 * Idempotently seeds the `deck` row + its 37-question `deckQuestion` roster
 * for the ai-at-work deck (founder ask: "the current AI Check-In question set
 * becomes ONE deck with status in_review"). Same "ensure it exists, call it on
 * every relevant request" pattern as auth/bootstrap.ts's
 * ensureDefaultOrganization/ensureMembership — this is what actually
 * populates the rows, so the additive DB migration itself stays pure
 * `CREATE TABLE` with no hand-written data-seed SQL. Safe under concurrent
 * calls (onConflictDoNothing on both inserts, plus a re-read on a lost race).
 */
export async function ensureAiAtWorkDeck() {
  const deckRow = await ensureAiAtWorkDeckRow()
  await ensureAiAtWorkRoster()
  return deckRow
}

async function ensureAiAtWorkDeckRow() {
  const [existing] = await db.select().from(deck).where(eq(deck.slug, DECK_SLUG)).limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(deck)
    .values({
      slug: DECK_SLUG,
      title: AI_AT_WORK_TITLE,
      description: AI_AT_WORK_DESCRIPTION,
      status: 'in_review',
    })
    .onConflictDoNothing()
    .returning()
  if (created) return created

  // Lost a create race — re-read rather than fail.
  const [afterRace] = await db.select().from(deck).where(eq(deck.slug, DECK_SLUG)).limit(1)
  if (afterRace) return afterRace

  throw new Error(`Failed to create or find the "${DECK_SLUG}" deck`)
}

async function ensureAiAtWorkRoster() {
  const existingRoster = await db
    .select({questionId: deckQuestion.questionId})
    .from(deckQuestion)
    .where(eq(deckQuestion.deckSlug, DECK_SLUG))
  const seededIds = new Set(existingRoster.map((row) => row.questionId))
  const missing = QUESTION_IDS.filter((questionId) => !seededIds.has(questionId))
  if (missing.length === 0) return

  await db
    .insert(deckQuestion)
    .values(
      missing.map((questionId) => ({
        deckSlug: DECK_SLUG,
        questionId,
        actLabel: actLabelFor(questionId),
        sortOrder: QUESTION_IDS.indexOf(questionId),
      }))
    )
    .onConflictDoNothing()
}

/**
 * Idempotently seeds the `deck` row + full 66-question `deckQuestion` roster +
 * pre-approved `questionReview` rows for the "library" deck (issue #222) — the
 * classic, original WhoCards conversation deck shipped in @whocards/decks
 * (see bootstrap-logic.ts's LIBRARY_DECK for why it's the pick). This proves
 * the deck model (#215) is deck-agnostic: a second, structurally different
 * deck — multi-language, Pool-backed, no acts, no in-app review workflow —
 * slots into the same deck/deckQuestion/questionReview tables ai-at-work
 * uses, with no schema change.
 *
 * Deck status is seeded `shipped` (not `draft`/`in_review`/`approved`): this
 * is the live, already-shipped default deck, not a work-in-progress one. Each
 * question's review status is seeded `approved` with its shipped English text
 * as `currentText` for the same reason — unlike ai-at-work's PR #144 import
 * (an active variant-vote/approve workflow), there's nothing to review here;
 * this only exists so /decks and a question's `currentText` resolve to real
 * content instead of a blank draft. @whocards/decks stays the source of
 * truth — this reads its resolved deck at seed time and never writes back to
 * it (ai-at-work's emitDiff pattern is deliberately not extended here — see
 * decks.ts's `canEmitDiff`, which stays ai-at-work-only).
 *
 * Same idempotent, additive-only, concurrency-safe pattern as
 * ensureAiAtWorkDeck above.
 */
export async function ensureLibraryDeck() {
  const deckRow = await ensureLibraryDeckRow()
  await ensureLibraryRoster()
  await ensureLibraryReviews()
  return deckRow
}

async function ensureLibraryDeckRow() {
  const [existing] = await db.select().from(deck).where(eq(deck.slug, LIBRARY_DECK.slug)).limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(deck)
    .values({
      slug: LIBRARY_DECK.slug,
      title: LIBRARY_DECK.title,
      description: LIBRARY_DECK.description,
      status: 'shipped',
    })
    .onConflictDoNothing()
    .returning()
  if (created) return created

  // Lost a create race — re-read rather than fail.
  const [afterRace] = await db.select().from(deck).where(eq(deck.slug, LIBRARY_DECK.slug)).limit(1)
  if (afterRace) return afterRace

  throw new Error(`Failed to create or find the "${LIBRARY_DECK.slug}" deck`)
}

async function ensureLibraryRoster() {
  const existingRoster = await db
    .select({questionId: deckQuestion.questionId})
    .from(deckQuestion)
    .where(eq(deckQuestion.deckSlug, LIBRARY_DECK.slug))
  const seededIds = new Set(existingRoster.map((row) => row.questionId))
  const missing = buildLibraryRoster(LIBRARY_DECK).filter((row) => !seededIds.has(row.questionId))
  if (missing.length === 0) return

  await db.insert(deckQuestion).values(missing).onConflictDoNothing()
}

async function ensureLibraryReviews() {
  const existingReviews = await db
    .select({questionId: questionReview.questionId})
    .from(questionReview)
    .where(eq(questionReview.deckSlug, LIBRARY_DECK.slug))
  const seededIds = new Set(existingReviews.map((row) => row.questionId))
  const missing = buildLibraryReviews(LIBRARY_DECK).filter((row) => !seededIds.has(row.questionId))
  if (missing.length === 0) return

  await db.insert(questionReview).values(missing).onConflictDoNothing()
}
