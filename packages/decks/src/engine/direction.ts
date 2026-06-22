import type {LanguageCode} from '../types'

type LocaleTextInfo = {direction?: string}
type LocaleWithTextInfo = {
  getTextInfo?: () => LocaleTextInfo
  textInfo?: LocaleTextInfo
}

// Base language subtags written right-to-left. Checked before the Intl path below
// because Intl.Locale's textInfo/getTextInfo is unimplemented on some engines —
// notably Hermes (React Native), where the Intl branch returns undefined and every
// language (Hebrew included) would otherwise fall through to 'ltr'. `he` is the only
// RTL language currently shipped; the rest are guards for future additions.
const RTL_BASE_LANGUAGES = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish (Sorani)
  'dv', // Divehi / Maldivian
  'fa', // Persian / Farsi
  'he', // Hebrew
  'iw', // Hebrew (legacy code)
  'ks', // Kashmiri
  'ku', // Kurdish
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
])

/** Resolve a language's writing direction (handles RTL languages like `he`). */
export const getDirection = (language: LanguageCode): 'ltr' | 'rtl' => {
  if (!language) return 'ltr'

  // explicit set first — reliable across JS engines, including Hermes (RN), whose
  // Intl.Locale lacks textInfo so the branch below can't detect RTL on device
  const base = language.toLowerCase().split(/[-_]/)[0]
  if (base && RTL_BASE_LANGUAGES.has(base)) return 'rtl'

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
