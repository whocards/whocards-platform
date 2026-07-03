/**
 * Tests for src/lib/internal-store.ts — persistence of the hidden dev marker
 * (issue #178): default fallback (`false`), toggling on/off, and re-reading a
 * persisted value from a cold cache. Mirrors theme-store.test.ts.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import type AsyncStorageDefault from '@react-native-async-storage/async-storage'
import type * as InternalStoreModule from '../lib/internal-store'

type Store = typeof InternalStoreModule
type Storage = typeof AsyncStorageDefault

const load = (): {store: Store; storage: Storage} => {
  const storageModule = require('@react-native-async-storage/async-storage')
  return {
    store: require('../lib/internal-store'),
    storage: storageModule.default ?? storageModule,
  }
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

describe('internal-store', () => {
  it('falls back to false when nothing is stored', async () => {
    const {store} = load()
    expect(await store.getStoredInternal()).toBe(false)
  })

  it('persists and retrieves an "on" marker under whocards-internal', async () => {
    const {store, storage} = load()
    await store.setStoredInternal(true)
    expect(storage.setItem).toHaveBeenCalledWith('whocards-internal', 'true')
    expect(await store.getStoredInternal()).toBe(true)
  })

  it('persists turning the marker back off', async () => {
    const {store, storage} = load()
    await store.setStoredInternal(true)
    await store.setStoredInternal(false)
    expect(storage.setItem).toHaveBeenLastCalledWith('whocards-internal', 'false')
    expect(await store.getStoredInternal()).toBe(false)
  })

  it('reads a persisted "on" marker from AsyncStorage when the cache is cold', async () => {
    const {store, storage} = load()
    await storage.setItem('whocards-internal', 'true')
    expect(await store.getStoredInternal()).toBe(true)
  })

  it('caches the value: no getItem on repeated reads after a set', async () => {
    const {store, storage} = load()
    await store.setStoredInternal(true)
    jest.clearAllMocks()
    await store.getStoredInternal()
    await store.getStoredInternal()
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})
