/**
 * Tests for src/lib/theme-store.ts — global persistence of the Theme Display
 * setting (issue #163): default fallback ('system'), override persistence
 * (manual light/dark, and clearing back to 'system'), and rejection of
 * unknown stored values.
 *
 * The theme key is global (like the Game key), so each test resets the module
 * registry to start the in-memory cache cold — and must require AsyncStorage
 * from the SAME fresh registry the store sees, or the two would talk to
 * different mock instances. Mirrors game-store.test.ts.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import type AsyncStorageDefault from '@react-native-async-storage/async-storage'
import type * as ThemeStoreModule from '../lib/theme-store'

type Store = typeof ThemeStoreModule
type Storage = typeof AsyncStorageDefault

const load = (): {store: Store; storage: Storage} => {
  const storageModule = require('@react-native-async-storage/async-storage')
  return {
    store: require('../lib/theme-store'),
    storage: storageModule.default ?? storageModule,
  }
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

describe('theme-store', () => {
  it('falls back to "system" when nothing is stored', async () => {
    const {store} = load()
    expect(await store.getStoredTheme()).toBe('system')
  })

  it('persists and retrieves a manual override under whocards-theme', async () => {
    const {store, storage} = load()
    await store.setStoredTheme('dark')
    expect(storage.setItem).toHaveBeenCalledWith('whocards-theme', 'dark')
    expect(await store.getStoredTheme()).toBe('dark')
  })

  it('persists the light override too', async () => {
    const {store, storage} = load()
    await store.setStoredTheme('light')
    expect(storage.setItem).toHaveBeenCalledWith('whocards-theme', 'light')
    expect(await store.getStoredTheme()).toBe('light')
  })

  it('reads a persisted override from AsyncStorage when the cache is cold', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-theme', 'dark')
    expect(await store.getStoredTheme()).toBe('dark')
  })

  it('overriding then selecting System again clears back to the default', async () => {
    const {store} = load()
    await store.setStoredTheme('dark')
    expect(await store.getStoredTheme()).toBe('dark')
    await store.setStoredTheme('system')
    expect(await store.getStoredTheme()).toBe('system')
  })

  it('ignores an unknown stored value and falls back to the default', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-theme', 'not-a-theme')
    expect(await store.getStoredTheme()).toBe('system')
  })

  it('caches the value: no getItem on repeated reads after a set', async () => {
    const {store, storage} = load()
    await store.setStoredTheme('dark')
    jest.clearAllMocks()
    await store.getStoredTheme()
    await store.getStoredTheme()
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})
