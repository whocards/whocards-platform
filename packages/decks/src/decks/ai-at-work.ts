import type {Deck, QuestionSet} from '../types'
import aiAtWorkQuestions from './ai-at-work.questions.json'

/**
 * The "AI Check-In" deck — a short, manager-runnable set that helps a team talk
 * honestly about AI arriving in their work. Its prompts are NOT a subset of the
 * Pool — they're their own curated, English-only set — so the deck carries them
 * inline.
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
