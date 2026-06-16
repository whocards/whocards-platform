import type {LanguageCode, Pool, QuestionId} from '../types'
import languageNames from './languages.json'
import questions from './questions.json'

/** The master, multilingual store of Question content (the Pool). */
export const pool: Pool = questions as Pool

/** Every question id in the Pool, in pool order. */
export const poolQuestionIds: QuestionId[] = Object.keys(pool)

/** Language code -> human display name (e.g. `en` -> `English`). */
export const languages: Record<LanguageCode, string> = languageNames

/** Every language code the Pool ships, in declared order. */
export const LANGUAGE_CODES: LanguageCode[] = Object.keys(languages)

/** The default language used when a deck doesn't say otherwise. */
export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** Is `code` a language the Pool knows about? */
export const isLanguageCode = (code: string): boolean => code in languages

/** Display name for a language code, or `undefined` if unknown. */
export const getLanguageName = (code: string): string | undefined => languages[code]
