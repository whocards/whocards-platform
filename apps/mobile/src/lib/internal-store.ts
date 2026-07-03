import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The hidden dev marker (issue #178): a manual `is_internal` override for the
 * owner's physical dev phones, which — unlike a simulator/emulator (see
 * `Device.isDevice` in observability.ts) — can't be told apart from a real
 * player's device automatically. Toggled by a long-press on the Library
 * wordmark (see use-internal-marker.ts / app/index.tsx), deliberately with no
 * visible Settings entry, so it can't be flipped by accident.
 */

/** Global AsyncStorage key. Prefix matches the other whocards-* keys. */
const STORAGE_KEY = 'whocards-internal'

// in-memory cache — skip the AsyncStorage round-trip inside one session
let cache: boolean | undefined

/**
 * Returns the persisted marker, falling back to `false` (a normal player
 * device) when nothing is stored.
 */
export const getStoredInternal = async (): Promise<boolean> => {
  if (cache !== undefined) return cache

  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  cache = stored === 'true'
  return cache
}

/** Persists the marker and warms the in-memory cache. */
export const setStoredInternal = async (internal: boolean): Promise<void> => {
  cache = internal
  await AsyncStorage.setItem(STORAGE_KEY, internal ? 'true' : 'false')
}
