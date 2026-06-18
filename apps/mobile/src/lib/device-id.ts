import AsyncStorage from '@react-native-async-storage/async-storage'
import {randomUUID} from 'expo-crypto'

/**
 * AsyncStorage key for this Device's stable anonymous id. Mirrors the web
 * key so the two surfaces speak the same Device vocabulary (CONTEXT.md →
 * Device; ticket 0003 M1/W1).
 */
const DEVICE_ID_KEY = 'whocards-device-id'

// in-memory cache so repeat callers in one session skip the AsyncStorage round-trip
let cached: string | undefined

/**
 * The Device id — minted once with `expo-crypto`'s `randomUUID()`, persisted in
 * AsyncStorage, then reused on every later call (this session and future runs).
 *
 * A Device is the only identity that exists pre-accounts; its id is attached to
 * every Answer so a Device's history can later be claimed into an account.
 */
export const getDeviceId = async (): Promise<string> => {
  if (cached) return cached

  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (stored) {
    cached = stored
    return stored
  }

  const minted = randomUUID()
  await AsyncStorage.setItem(DEVICE_ID_KEY, minted)
  cached = minted
  return minted
}
