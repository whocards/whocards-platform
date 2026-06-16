import type {Language} from '~types'
import languages from '~data/languages.json'

export const DEFAULT_LANGUAGE: Language = 'en'

export const LANG_KEYS = Object.keys(languages)

export const LANGUAGES: {[K in Language]: string} = languages

/**
 * Gets the language display name or throws an error if not found
 */
export const getLangName = (key?: string | Language): string => {
  if (!languages[key as Language]) {
    throw Error('getLangName: invalid language')
  }
  return languages[key as Language]
}

/**
 * Unsused
 */
export const getBrowserLang = (): Language => {
  const key = ((navigator.languages && navigator.languages[0]) || navigator.language).toLowerCase()

  let res = ''

  if (LANG_KEYS.includes(key)) res = key
  if (LANG_KEYS.includes(key.split('-')[0])) res = key.split('-')[0]
  if (LANG_KEYS.includes(key.split('_')[0])) res = key.split('_')[0]

  return (res || DEFAULT_LANGUAGE) as Language
}

/**
 * get current language from url with fallback to default language
 */
export const getCurrentLanguage = (url: string): Language => {
  const lang = url.replace(/^\//, '').split('/')[0] as Language

  return LANG_KEYS.includes(lang) ? lang : DEFAULT_LANGUAGE
}
