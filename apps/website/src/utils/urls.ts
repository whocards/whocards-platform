import {idsStore} from '~stores/Game.store'
import type {QuestionId} from '~types'
// import directly from the defining module, not the `~utils` barrel: the barrel
// re-exports this file, so importing it back through `~utils` formed an
// index → urls → index circular dependency (fallow dead-code).
import {DEFAULT_LANGUAGE, LANG_KEYS} from '~utils/language'

export const getTrimmedPath = () => window.location.pathname.replace(/\/$/, '')

/**
 *
 */
export const getCurrentQuestionId = (): QuestionId => {
  return getTrimmedPath().split('/').pop() as QuestionId
}

/**
 * Build a link into the play screen, deep-linked to the current question via `?q=`.
 * defaultLang in case we want to start from different language in the future
 */
export const getCurrentQuestionUrl = (lang?: string) => {
  // derive the language from the current page path (e.g. `/en`) when not given
  let pathLang = getTrimmedPath().replace(/^\//, '') || DEFAULT_LANGUAGE

  if (!LANG_KEYS.includes(pathLang)) {
    pathLang = DEFAULT_LANGUAGE
  }
  // language is now a query param, not a url path: /play?lang=<lang>&q=<id>
  return `${window.location.origin}/play?lang=${lang || pathLang}&q=${idsStore.get().current}`
}

/**
 *
 */
export const getQuestionUrl = (id: QuestionId) => {
  if (!id) return ''

  return window.location.origin + getTrimmedPath().replace(/\/[^\/]*$/, `/${id}`)
}

export const isPrintPage = () => {
  return window.location.pathname.replace(/\/+$/, '') === '/print'
}
