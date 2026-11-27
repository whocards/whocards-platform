import {getLocales} from 'expo-localization'
import {DEFAULT_LANGUAGE} from '@whocards/decks'

// iOS reports these codes for languages our Decks spell differently.
const DEVICE_ALIASES: Record<string, string> = {ja: 'jp', iw: 'he'}

/** The Language until the player picks one: the phone's own when the Deck has it, else English. */
export const deviceLanguage = (languages: readonly string[]): string => {
  for (const {languageTag, languageCode} of getLocales()) {
    const code = languageCode ? (DEVICE_ALIASES[languageCode] ?? languageCode) : undefined
    const match = [languageTag.toLowerCase(), code].find((c) => c && languages.includes(c))
    if (match) return match
  }
  return languages.includes(DEFAULT_LANGUAGE)
    ? DEFAULT_LANGUAGE
    : (languages[0] ?? DEFAULT_LANGUAGE)
}
