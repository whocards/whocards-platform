import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Per-deck AsyncStorage key for the player's chosen language. Using a per-deck
 * key means "I prefer Spanish" on the Friends deck is independent of any
 * preference on the Office deck — the same intent as the web's per-deck
 * `languageStorageKey` prop (apps/website/src/components/Play/Play.tsx).
 *
 * Key prefix matches the other whocards-* keys in AsyncStorage (see device-id.ts).
 */
const storageKey = (deckSlug: string) => `whocards-language:${deckSlug}`

// in-memory cache keyed by deckSlug — skip the AsyncStorage round-trip inside
// one session, mirrors the caching strategy in device-id.ts
const cache: Record<string, string> = {}

/**
 * Returns the persisted language for `deckSlug`, or `undefined` if none is stored.
 * The caller is responsible for validating the returned value against the deck's
 * `languages` list before applying it (a language code can become invalid if the
 * deck is updated to drop a language).
 */
export const getStoredLanguage = async (deckSlug: string): Promise<string | undefined> => {
  if (cache[deckSlug]) return cache[deckSlug]

  const stored = await AsyncStorage.getItem(storageKey(deckSlug))
  if (stored) {
    cache[deckSlug] = stored
    return stored
  }

  return undefined
}

/**
 * Persists `language` for `deckSlug` so the player resumes in the same language
 * on next launch. Also updates the in-memory cache so the next `getStoredLanguage`
 * call in the same session is synchronous.
 */
export const setStoredLanguage = async (deckSlug: string, language: string): Promise<void> => {
  cache[deckSlug] = language
  await AsyncStorage.setItem(storageKey(deckSlug), language)
}
