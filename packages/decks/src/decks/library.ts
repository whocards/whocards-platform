import {DEFAULT_LANGUAGE, LANGUAGE_CODES} from '../pool'
import type {Deck} from '../types'

// default language first, the rest available in the in-screen language control.
const libraryLanguages = [DEFAULT_LANGUAGE, ...LANGUAGE_CODES.filter((l) => l !== DEFAULT_LANGUAGE)]

/**
 * The full WhoCards library — every question in the Pool. This is the default
 * `/play` experience, so it keeps the legacy hero background and white text.
 */
export const libraryDeck: Deck = {
  slug: 'library',
  title: 'WhoCards',
  description:
    'WhoCards help us create conversations that encourage honest self-expression, active listening and deeper human connections.',
  source: {kind: 'library'}, // no ids => all questions, in pool order
  languages: libraryLanguages,
  questionClassName: 'text-white',
  oldBg: true,
  languageStorageKey: 'who-language',
}
