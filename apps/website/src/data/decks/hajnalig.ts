import type {QuestionSet} from '~components/Play'

import hajnaligQuestions from '~pages/events/hajnalig/_data/hajnalig-questions.json'
import type {Deck} from './types'

/**
 * The hajnalig event deck. Its questions are NOT a subset of the global pool —
 * the event has its own curated set with hu/en text that differs from the
 * library — so the deck carries them inline.
 *
 * Language order matters: the first entry ('hu') is the default.
 */
export const hajnaligDeck: Deck = {
  slug: 'hajnalig',
  title: 'Hajnalig',
  description:
    'WhoCards help us create conversations that encourage honest self-expression, active listening and deeper human connections.',
  source: {kind: 'inline', questions: hajnaligQuestions as QuestionSet},
  languages: ['hu', 'en'],
  languageStorageKey: 'hajnalig-language',
  userIdStorageKey: 'hajnalig-user-id',
  tracking: {eventId: 1, endpoint: '/api/events/question-tracking'},
}
