import type {LanguageCode, QuestionId} from './types'

/**
 * One Answer event (CONTEXT.md → Answer record): the Device answered a Question
 * (which Deck, which Question, which language). The shared, typed contract both
 * clients (web + mobile) emit on each serve for the default Global Game.
 *
 * The engine stays pure (ADR-0003): it never records — the host injects a
 * {@link RecordAnswer} that ferries this event to the Answer record.
 */
export type AnswerEvent = {
  /** the Deck the Question was served from (the Global cycle is per-Deck) */
  deckSlug: string
  /** the answered Question's id (a Pool id is a string) */
  questionId: QuestionId
  /** the language the Card was shown in */
  language: LanguageCode
}

/**
 * The recorder a host injects to persist an {@link AnswerEvent}. Fire-and-forget
 * from the engine's view — queueing, retry, and the network/db live in the host.
 */
export type RecordAnswer = (e: AnswerEvent) => void
