import type {Deck, QuestionSet} from '../types'
import hajnaligQuestions from './hajnalig.questions.json'

/**
 * The hajnalig event deck. Its questions are NOT a subset of the Pool — the event
 * has its own curated hu/en set — so the deck carries them inline. Language order
 * matters: the first entry ('hu') is the default.
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
