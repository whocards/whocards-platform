/**
 * Tests for src/lib/game-store.ts — global persistence of the chosen Game,
 * default fallback, and rejection of unknown stored ids.
 *
 * The game key is global (unlike the per-deck language store), so each test
 * resets the module registry to start the in-memory cache cold — and must
 * require AsyncStorage from the SAME fresh registry the store sees, or the
 * two would talk to different mock instances.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import type AsyncStorageDefault from '@react-native-async-storage/async-storage'
import type * as GameStoreModule from '../lib/game-store'

type Store = typeof GameStoreModule
type Storage = typeof AsyncStorageDefault

const load = (): {store: Store; storage: Storage} => {
  const storageModule = require('@react-native-async-storage/async-storage')
  return {
    store: require('../lib/game-store'),
    storage: storageModule.default ?? storageModule,
  }
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

describe('game-store', () => {
  it('falls back to the default game when nothing is stored', async () => {
    const {store} = load()
    expect(await store.getStoredGame()).toBe('wh')
  })

  it('persists and retrieves a game under whocards-game', async () => {
    const {store, storage} = load()
    await store.setStoredGame('pick')
    expect(storage.setItem).toHaveBeenCalledWith('whocards-game', 'pick')
    expect(await store.getStoredGame()).toBe('pick')
  })

  it('reads a persisted game from AsyncStorage when the cache is cold', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-game', 'pick')
    expect(await store.getStoredGame()).toBe('pick')
  })

  it('ignores an unknown stored id and falls back to the default', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-game', 'not-a-game')
    expect(await store.getStoredGame()).toBe('wh')
  })

  it('caches the value: no getItem on repeated reads after a set', async () => {
    const {store, storage} = load()
    await store.setStoredGame('pick')
    jest.clearAllMocks()
    await store.getStoredGame()
    await store.getStoredGame()
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})
