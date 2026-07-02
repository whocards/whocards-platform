import AsyncStorage from '@react-native-async-storage/async-storage'
import {DEFAULT_GAME, isGameId} from '@whocards/decks/engine'
import type {GameId} from '@whocards/decks/engine'

/**
 * Global (not per-deck) AsyncStorage key for the chosen Game — the way of
 * playing travels with the player, not with a deck. Key prefix matches the
 * other whocards-* keys (see device-id.ts, language-store.ts).
 */
const STORAGE_KEY = 'whocards-game'

// in-memory cache — skip the AsyncStorage round-trip inside one session
let cache: GameId | undefined

/**
 * Returns the persisted Game, falling back to the default when nothing is
 * stored or the stored value is no longer a known game id.
 */
export const getStoredGame = async (): Promise<GameId> => {
  if (cache) return cache

  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  if (stored && isGameId(stored)) {
    cache = stored
    return stored
  }

  return DEFAULT_GAME
}

/** Persists the chosen Game and warms the in-memory cache. */
export const setStoredGame = async (game: GameId): Promise<void> => {
  cache = game
  await AsyncStorage.setItem(STORAGE_KEY, game)
}
