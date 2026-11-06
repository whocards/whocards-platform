import {hasDeckLanguage} from './language'

const SESSIONS = 'wc-sessions'
const LAST_SEEN = 'wc-last-seen'
const SHOWN = 'wc-translate-prompt-shown'
// Matches PostHog's session timeout, where the 2nd-session numbers behind #391 come from.
const SESSION_GAP_MS = 30 * 60 * 1000

/**
 * Counts this page view's session and says whether to show the translator prompt: once, from the
 * 2nd session on, only to a browser language with no deck (#391).
 */
export const takeTranslatePrompt = (
  browserLanguage: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now = Date.now()
): boolean => {
  if (hasDeckLanguage(browserLanguage)) return false
  const lastSeen = storage.getItem(LAST_SEEN)
  const isNewSession = lastSeen === null || now - Number(lastSeen) > SESSION_GAP_MS
  const sessions = Number(storage.getItem(SESSIONS) ?? 0) + (isNewSession ? 1 : 0)
  storage.setItem(SESSIONS, String(sessions))
  storage.setItem(LAST_SEEN, String(now))
  if (sessions < 2 || storage.getItem(SHOWN)) return false
  storage.setItem(SHOWN, '1')
  return true
}
