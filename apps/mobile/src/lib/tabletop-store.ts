import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Global (not per-deck) AsyncStorage key for Tabletop mode (issue #148, a
 * Display setting per CONTEXT.md). Global rather than per-deck because it
 * describes how the player has physically set the phone down — flat on the
 * table between two sides — not a preference about one deck's content, the
 * same reasoning as the Game choice (see game-store.ts). Key prefix matches
 * the other whocards-* keys (see device-id.ts, language-store.ts).
 */
const STORAGE_KEY = 'whocards-tabletop-mode'

// in-memory cache — skip the AsyncStorage round-trip inside one session
let cache: boolean | undefined

/** Returns the persisted Tabletop mode preference, defaulting to off. */
export const getStoredTabletopMode = async (): Promise<boolean> => {
  if (cache !== undefined) return cache

  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  cache = stored === 'true'
  return cache
}

/** Persists the Tabletop mode preference and warms the in-memory cache. */
export const setStoredTabletopMode = async (enabled: boolean): Promise<void> => {
  cache = enabled
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
}
