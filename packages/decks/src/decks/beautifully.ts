import type {Deck} from '../types'
import beautifullyQuestions from './beautifully.questions.json'

/**
 * The "Beautifully" deck — the original 2023 WhoCards set, recovered from the
 * archived `whocards/beautifully-webapp` (beautifully.whocards.cc). Its 61
 * questions are an earlier edition of the Pool: most share an id with a Pool
 * question but the wording (and translations) differ, and it ships only 7 of
 * the Pool's 14 languages — so the deck carries its own QuestionSet inline
 * rather than referencing the Pool.
 *
 * Not yet registered in the deck registry: registering it would surface it on
 * `/play/[deck]`, the API manifest, and mobile automatically.
 */
export const beautifullyDeck: Deck = {
  slug: 'beautifully',
  title: 'Beautifully',
  description:
    'The original 2023 WhoCards deck — 61 questions for honest self-expression, active listening and deeper human connections.',
  source: {kind: 'inline', questions: beautifullyQuestions},
  languages: ['en', 'de', 'es', 'fr', 'hu', 'pt-br', 'pt'],
  questionClassName: 'text-white',
  oldBg: true,
  languageStorageKey: 'beautifully-language',
}
