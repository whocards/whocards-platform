import type {Language} from '~types'
import languages from '~data/languages.json'

export const DEFAULT_LANGUAGE: Language = 'en'

export const LANG_KEYS = Object.keys(languages)

export const LANGUAGES: {[K in Language]: string} = languages

/**
 * Gets the language display name or throws an error if not found
 */
export const getLangName = (key?: string): string => {
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

// Our internal language keys double as URL segments (/jp/question/1) and are
// intentionally left alone here — renaming them is a much larger, riskier
// surface (deck data, print, mobile). This maps a key to the spec-correct
// BCP-47 primary language subtag for contexts where that distinction matters:
// the `<html lang>` attribute, `hreflang` alternates, and `og:locale` (#207).
// Every key is already a valid subtag except `jp`, which is really the ISO
// 3166-1 *country* code for Japan — the correct language subtag for Japanese
// is `ja`. Region subtags (e.g. `pt-br`) are also upper-cased to convention
// (`pt-BR`); functionally case-insensitive, but tools/crawlers expect it.
const BCP47_OVERRIDES: Record<string, string> = {jp: 'ja'}

export const toBCP47LanguageTag = (lang: string): string => {
  const [primary, region] = (BCP47_OVERRIDES[lang] ?? lang).split('-')
  return region ? `${primary}-${region.toUpperCase()}` : primary
}
