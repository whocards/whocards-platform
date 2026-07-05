import {eq} from 'drizzle-orm'

import {db} from '../db'
import {deck, deckQuestion} from '../db/schema'
import {actLabelFor, DECK_SLUG, QUESTION_IDS} from '../trpc/routers/question-review-logic'

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
