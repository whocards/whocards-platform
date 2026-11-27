import {useCallback, useSyncExternalStore} from 'react'
import {DEFAULT_DECK_SLUG, getDeck} from '@whocards/decks'

import da from '@/i18n/da.json'
import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import es from '@/i18n/es.json'
import fr from '@/i18n/fr.json'
import he from '@/i18n/he.json'
import hu from '@/i18n/hu.json'
import jp from '@/i18n/jp.json'
import pl from '@/i18n/pl.json'
import ptBr from '@/i18n/pt-br.json'
import pt from '@/i18n/pt.json'
import ro from '@/i18n/ro.json'
import sr from '@/i18n/sr.json'
import zh from '@/i18n/zh.json'

import {deviceLanguage} from './device-language'

/**
 * The app's own words in the player's Language (the Questions carry their own translations).
 * English is the source; a missing key in another catalog falls back to it.
 */
export type MessageKey = keyof typeof en
type Catalog = Partial<Record<MessageKey, string>>

const CATALOGS: Record<string, Catalog> = {
  da,
  de,
  en,
  es,
  fr,
  he,
  hu,
  jp,
  pl,
  pt,
  'pt-br': ptBr,
  ro,
  sr,
  zh,
}

export {NATIVE_LANGUAGE_NAMES} from './language-names'

let current = deviceLanguage(getDeck(DEFAULT_DECK_SLUG)?.languages ?? Object.keys(CATALOGS))
const listeners = new Set<() => void>()

/** Switches the app's words to `language` (the Language setting, or a stored one at launch). */
export const setUiLanguage = (language: string) => {
  if (language === current || !CATALOGS[language]) return
  current = language
  for (const listener of listeners) listener()
}

export const getUiLanguage = () => current

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
  language = current
): string => {
  const template = CATALOGS[language]?.[key] ?? en[key]
  return vars
    ? template.replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match))
    : template
}

/** `t(key, vars)` in the current UI language, re-rendering when it changes. */
export const useT = () => {
  const language = useSyncExternalStore(subscribe, getUiLanguage, getUiLanguage)
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(key, vars, language),
    [language]
  )
}
