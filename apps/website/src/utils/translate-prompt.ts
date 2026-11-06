import {hasDeckLanguage} from './language'

const SESSIONS = 'wc-sessions'
const LAST_SEEN = 'wc-last-seen'
const SHOWN = 'wc-translate-prompt-shown'
// Matches PostHog's session timeout, where the 2nd-session numbers behind #391 come from.
const SESSION_GAP_MS = 30 * 60 * 1000

const primarySubtag = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]

/** Counts this page view's session; true once, from the 2nd session, for a language with no deck. */
export const takeTranslatePrompt = (
  browserLanguage: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  pathname: string,
  now = Date.now()
): boolean => {
  if (hasDeckLanguage(browserLanguage)) return false
  const lastSeen = storage.getItem(LAST_SEEN)
  const isNewSession = lastSeen === null || now - Number(lastSeen) > SESSION_GAP_MS
  const sessions = Number(storage.getItem(SESSIONS) ?? 0) + (isNewSession ? 1 : 0)
  storage.setItem(SESSIONS, String(sessions))
  storage.setItem(LAST_SEEN, String(now))
  // A Game in progress keeps the prompt pending for the next non-play page.
  if (sessions < 2 || storage.getItem(SHOWN) || /^\/play(\/|$)/.test(pathname)) return false
  storage.setItem(SHOWN, '1')
  return true
}

/** English name of a browser tag's language, the prompt's editable pre-fill. */
export const languageName = (tag: string) => {
  const primary = primarySubtag(tag)
  try {
    return new Intl.DisplayNames(['en'], {type: 'language'}).of(primary) ?? primary
  } catch {
    return primary
  }
}

/** The browser's language code while the field still holds the pre-fill, else what was typed. */
export const signupLanguage = (typed: string, browserLanguage: string) =>
  typed === languageName(browserLanguage) ? primarySubtag(browserLanguage) : typed
