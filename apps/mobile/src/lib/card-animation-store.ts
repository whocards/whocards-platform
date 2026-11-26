import AsyncStorage from '@react-native-async-storage/async-storage'

/** How a Card animates when Classic moves on (issue #456, a Display setting): it slides, or it flips. */
export type CardAnimation = 'slide' | 'flip'

// Global, like Tabletop mode (tabletop-store.ts): it is about this Device, not one Deck.
const STORAGE_KEY = 'whocards-card-animation'

// in-memory cache — skip the AsyncStorage round-trip inside one session
let cache: CardAnimation | undefined

/** Returns the persisted Card animation, defaulting to Slide. */
export const getStoredCardAnimation = async (): Promise<CardAnimation> => {
  if (cache !== undefined) return cache

  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  cache = stored === 'flip' ? 'flip' : 'slide'
  return cache
}

/** Persists the Card animation and warms the in-memory cache. */
export const setStoredCardAnimation = async (animation: CardAnimation): Promise<void> => {
  cache = animation
  await AsyncStorage.setItem(STORAGE_KEY, animation)
}
