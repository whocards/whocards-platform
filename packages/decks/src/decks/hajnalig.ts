import type {Deck, QuestionSet} from '../types'
import hajnaligQuestions from './hajnalig.questions.json'

/**
 * The hajnalig event deck. Its questions are NOT a subset of the Pool — the event
 * has its own curated hu/en set — so the deck carries them inline. Language order
 * matters: the first entry ('hu') is the default.
 *
 * The event runs yearly. The 2025 edition shipped questions 1–140; the 2026
 * edition added 141–163. Each edition is tracked as its own conference event
 * (eventId), so engagement is attributable per year.
 */
const allQuestions = hajnaligQuestions as QuestionSet

// Questions 1–140 are the 2025 edition. Numeric-string keys iterate in ascending
// numeric order in JS, so this preserves the authored card order.
const questions2025: QuestionSet = Object.fromEntries(
  Object.entries(allQuestions).filter(([id]) => Number(id) <= 140)
)

const presentation = {
  description:
    'WhoCards help us create conversations that encourage honest self-expression, active listening and deeper human connections.',
  languages: ['hu', 'en'] as string[],
  languageStorageKey: 'hajnalig-language',
  userIdStorageKey: 'hajnalig-user-id',
}

/** Hajnalig 2025 edition — the original 140 questions; tracked as event 1. */
export const hajnalig2025Deck: Deck = {
  ...presentation,
  slug: 'hajnalig-2025',
  title: 'Hajnalig 2025',
  source: {kind: 'inline', questions: questions2025},
  tracking: {eventId: 1, endpoint: '/api/events/question-tracking'},
}

/** Hajnalig 2026 edition — the full 163-question set; tracked as event 2. */
export const hajnalig2026Deck: Deck = {
  ...presentation,
  slug: 'hajnalig',
  title: 'Hajnalig',
  source: {kind: 'inline', questions: allQuestions},
  tracking: {eventId: 2, endpoint: '/api/events/question-tracking'},
}

/**
 * The canonical Hajnalig deck = the current edition (2026). Kept under the
 * 'hajnalig' slug so the registry, /play/hajnalig and /events/hajnalig are
 * unchanged for callers; only the question set + tracking event id advanced.
 */
export const hajnaligDeck: Deck = hajnalig2026Deck
