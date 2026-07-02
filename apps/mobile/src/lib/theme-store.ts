import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * The Theme Display setting (issue #163, CONTEXT.md's Display setting: a
 * per-Device presentation choice that never affects which Card is drawn or
 * whose progress is remembered). `'system'` follows the OS Appearance;
 * `'light'` / `'dark'` are an explicit manual override.
 */
export type ThemeSetting = 'system' | 'light' | 'dark'

/**
 * Global (not per-deck) AsyncStorage key for the Theme setting — an appearance
 * preference travels with the player, not with a deck, the same reasoning as
 * the Game choice (see game-store.ts) and Tabletop mode (see tabletop-store.ts).
 * Key prefix matches the other whocards-* keys.
 */
const STORAGE_KEY = 'whocards-theme'
const DEFAULT_THEME: ThemeSetting = 'system'

// in-memory cache — skip the AsyncStorage round-trip inside one session
let cache: ThemeSetting | undefined

const isThemeSetting = (value: string): value is ThemeSetting =>
  value === 'system' || value === 'light' || value === 'dark'

/**
 * Returns the persisted Theme setting, falling back to `'system'` when
 * nothing is stored or the stored value is no longer recognized.
 */
export const getStoredTheme = async (): Promise<ThemeSetting> => {
  if (cache) return cache

  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  if (stored && isThemeSetting(stored)) {
    cache = stored
    return stored
  }

  return DEFAULT_THEME
}

/** Persists the chosen Theme setting and warms the in-memory cache. */
export const setStoredTheme = async (theme: ThemeSetting): Promise<void> => {
  cache = theme
  await AsyncStorage.setItem(STORAGE_KEY, theme)
}
