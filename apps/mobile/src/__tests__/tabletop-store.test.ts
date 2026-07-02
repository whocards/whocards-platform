/**
 * Tests for src/lib/tabletop-store.ts — global persistence of the Tabletop
 * mode preference (issue #148).
 *
 * The key is global (not per-deck, like the Game choice — see
 * game-store.test.ts), so each test resets the module registry to start the
 * in-memory cache cold, and must require AsyncStorage from the SAME fresh
 * registry the store sees, or the two would talk to different mock instances.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import type AsyncStorageDefault from '@react-native-async-storage/async-storage'
import type * as TabletopStoreModule from '../lib/tabletop-store'

type Store = typeof TabletopStoreModule
type Storage = typeof AsyncStorageDefault

const load = (): {store: Store; storage: Storage} => {
  const storageModule = require('@react-native-async-storage/async-storage')
  return {
    store: require('../lib/tabletop-store'),
    storage: storageModule.default ?? storageModule,
  }
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

describe('tabletop-store', () => {
  it('defaults to off when nothing is stored', async () => {
    const {store} = load()
    expect(await store.getStoredTabletopMode()).toBe(false)
  })

  it('persists and retrieves the preference under whocards-tabletop-mode', async () => {
    const {store, storage} = load()
    await store.setStoredTabletopMode(true)
    expect(storage.setItem).toHaveBeenCalledWith('whocards-tabletop-mode', 'true')
    expect(await store.getStoredTabletopMode()).toBe(true)
  })

  it('persists false explicitly (round-trips off after being on)', async () => {
    const {store, storage} = load()
    await store.setStoredTabletopMode(true)
    await store.setStoredTabletopMode(false)
    expect(storage.setItem).toHaveBeenLastCalledWith('whocards-tabletop-mode', 'false')
    expect(await store.getStoredTabletopMode()).toBe(false)
  })

  it('reads a persisted preference from AsyncStorage when the cache is cold', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-tabletop-mode', 'true')
    expect(await store.getStoredTabletopMode()).toBe(true)
  })

  it('caches the value: no getItem on repeated reads after a set', async () => {
    const {store, storage} = load()
    await store.setStoredTabletopMode(true)
    jest.clearAllMocks()
    await store.getStoredTabletopMode()
    await store.getStoredTabletopMode()
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})
