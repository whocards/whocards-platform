import type {QuestionSet} from '~components/Play'

import aiAtWorkQuestions from './ai-at-work.questions.json'
import type {Deck} from './types'

/**
 * The "AI Check-In" deck — a short, manager-runnable set that helps a team talk
 * honestly about AI arriving in their work (the fear, the opportunity, what
 * stays human, and the norms they want to live by). Its 37 prompts are NOT a
 * subset of the global pool — they're their own curated, English-only set — so
 * the deck carries them inline.
 *
 * English-only for now: the prompts have no translations yet, so `languages`
 * is just ['en']. Matches the main /play look (legacy hero background, white
 * question text).
 */
export const aiAtWorkDeck: Deck = {
  slug: 'ai-at-work',
  title: 'AI Check-In',
  description:
    'A 20-minute team check-in for talking honestly about AI at work — the fear, what stays human, and the norms you want to live by.',
  source: {kind: 'inline', questions: aiAtWorkQuestions as QuestionSet},
  languages: ['en'],
  questionClassName: 'text-white',
  oldBg: true,
}
