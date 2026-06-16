import {pool} from '../pool'
import type {Deck, QuestionSet, ResolvedDeck} from '../types'
import {aiAtWorkDeck} from './ai-at-work'
import {hajnaligDeck} from './hajnalig'
import {libraryDeck} from './library'

/**
 * All registered decks, keyed by slug. Literal keys (not computed from
 * `deck.slug`) so `DeckSlug` is a string-literal union and `getDeck` can narrow.
 */
const decks = {
  library: libraryDeck,
  hajnalig: hajnaligDeck,
  'ai-at-work': aiAtWorkDeck,
} satisfies Record<string, Deck>

export type DeckSlug = keyof typeof decks

/** The slug of the default deck served at `/play` (no path segment). */
export const DEFAULT_DECK_SLUG = 'library' as const satisfies DeckSlug

/** Resolve a deck's authored source into a concrete, ordered QuestionSet. */
const resolveQuestions = (deck: Deck): {questions: QuestionSet; questionIds: string[]} => {
  if (deck.source.kind === 'inline') {
    const questions = deck.source.questions
    return {questions, questionIds: Object.keys(questions)}
  }

  // library source: reference ids into the Pool (no text duplication).
  const ids = deck.source.ids ?? Object.keys(pool)
  const questions: QuestionSet = {}
  for (const id of ids) {
    const entry = pool[id]
    if (entry) questions[id] = entry
  }
  return {questions, questionIds: Object.keys(questions)}
}

/** Resolve an authored {@link Deck} into a {@link ResolvedDeck}. */
export const resolveDeck = (deck: Deck): ResolvedDeck => ({...deck, ...resolveQuestions(deck)})

/** Is `slug` a registered deck? */
export const isDeckSlug = (slug: string): slug is DeckSlug => slug in decks

/**
 * Resolve a deck by slug into a {@link ResolvedDeck}. Returns `undefined` for an
 * unknown slug so callers can 404 / fall back as they see fit.
 */
export const getDeck = (slug: string): ResolvedDeck | undefined =>
  isDeckSlug(slug) ? resolveDeck(decks[slug]) : undefined

/** Every registered deck, resolved (useful for static path generation). */
export const getAllDecks = (): ResolvedDeck[] => Object.values(decks).map(resolveDeck)
