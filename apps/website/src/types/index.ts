import type languages from '~data/languages.json'
import type questions from '~data/questions.json'

export type Language = keyof typeof languages

export type QuestionId = keyof typeof questions

export type QuestionIds = QuestionId[]

export type QuestionsResponse1Lang = Record<QuestionId, string>

export type QuestionsResponse = Record<QuestionId, Record<Language, string>>

export type LanguagesResponse = {
  [key in Language]: string
}
