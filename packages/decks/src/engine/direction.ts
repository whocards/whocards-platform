import type {LanguageCode} from '../types'

type LocaleTextInfo = {direction?: string}
type LocaleWithTextInfo = {
  getTextInfo?: () => LocaleTextInfo
  textInfo?: LocaleTextInfo
}

/** Resolve a language's writing direction (handles RTL languages like `he`). */
export const getDirection = (language: LanguageCode): 'ltr' | 'rtl' => {
  if (typeof Intl === 'undefined' || !('Locale' in Intl)) return 'ltr'
  try {
    // getTextInfo() is the newer method; textInfo is the older accessor.
    const locale = new Intl.Locale(language) as unknown as LocaleWithTextInfo
    const info = typeof locale.getTextInfo === 'function' ? locale.getTextInfo() : locale.textInfo
    return info?.direction === 'rtl' ? 'rtl' : 'ltr'
  } catch {
    return 'ltr'
  }
}
