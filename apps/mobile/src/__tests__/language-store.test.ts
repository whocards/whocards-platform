/**
 * Tests for src/lib/language-store.ts
 *
 * Verifies per-deck AsyncStorage persistence, in-memory caching, missing-key
 * fallback, and isolation between deck slugs.
 *
 * Strategy: use unique deck slug suffixes per test so the module-level cache
 * doesn't cause cross-test interference (each deck key is independent). This
 * is simpler than resetting modules between tests and avoids referencing stale
 * AsyncStorage mock instances after a module reset.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import {getStoredLanguage, setStoredLanguage} from '../lib/language-store'

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
})

describe('language-store', () => {
  it('returns undefined when no language is stored for a deck', async () => {
    const result = await getStoredLanguage('test-deck-missing')
    expect(result).toBeUndefined()
  })

  it('persists and retrieves a language for a deck', async () => {
    await setStoredLanguage('test-deck-rw', 'es')
    // Read from the in-memory cache (set immediately by setStoredLanguage).
    const result = await getStoredLanguage('test-deck-rw')
    expect(result).toBe('es')
  })

  it('uses per-deck key whocards-language:{slug}', async () => {
    await setStoredLanguage('test-deck-key', 'he')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('whocards-language:test-deck-key', 'he')
  })

  it('reads the persisted value from AsyncStorage when the cache is cold', async () => {
    // Pre-seed AsyncStorage directly (bypasses the in-memory cache).
    await AsyncStorage.setItem('whocards-language:test-deck-cold', 'fr')
    // Use a slug that is NOT in the cache so it must fall through to AsyncStorage.
    const result = await getStoredLanguage('test-deck-cold')
    expect(result).toBe('fr')
  })

  it('isolates languages between different deck slugs', async () => {
    await setStoredLanguage('test-deck-iso-a', 'es')
    await setStoredLanguage('test-deck-iso-b', 'he')

    expect(await getStoredLanguage('test-deck-iso-a')).toBe('es')
    expect(await getStoredLanguage('test-deck-iso-b')).toBe('he')
  })

  it('returns undefined for a deck that was never written', async () => {
    await setStoredLanguage('test-deck-only-a', 'es')
    const result = await getStoredLanguage('test-deck-never-written')
    expect(result).toBeUndefined()
  })

  it('caches the value: does not call AsyncStorage.getItem on repeated reads', async () => {
    // setStoredLanguage also populates the in-memory cache.
    await setStoredLanguage('test-deck-cache', 'pt')
    jest.clearAllMocks() // reset call counts after the set

    // First get: may or may not hit AsyncStorage (cache is already warm).
    await getStoredLanguage('test-deck-cache')
    // Second get: must NOT call getItem again.
    await getStoredLanguage('test-deck-cache')

    // The cache is warm from setStoredLanguage, so getItem is never called.
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
  })

  it('calls AsyncStorage.setItem when saving a language', async () => {
    await setStoredLanguage('test-deck-set', 'de')
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('whocards-language:test-deck-set', 'de')
  })
})

describe('secondary display languages', () => {
  const {getStoredSecondaryLanguages, setStoredSecondaryLanguages} =
    require('../lib/language-store') as typeof import('../lib/language-store')

  it('returns an empty list when nothing is stored', async () => {
    expect(await getStoredSecondaryLanguages('test-deck-sec-missing')).toEqual([])
  })

  it('persists and retrieves secondaries under their own key', async () => {
    await setStoredSecondaryLanguages('test-deck-sec-rw', ['he', 'es'])
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'whocards-language-secondary:test-deck-sec-rw',
      JSON.stringify(['he', 'es'])
    )
    expect(await getStoredSecondaryLanguages('test-deck-sec-rw')).toEqual(['he', 'es'])
  })

  it('reads persisted secondaries from AsyncStorage when the cache is cold', async () => {
    await AsyncStorage.setItem(
      'whocards-language-secondary:test-deck-sec-cold',
      JSON.stringify(['fr'])
    )
    expect(await getStoredSecondaryLanguages('test-deck-sec-cold')).toEqual(['fr'])
  })

  it('caps the stored list at two languages', async () => {
    await setStoredSecondaryLanguages('test-deck-sec-cap', ['he', 'es', 'fr'])
    expect(await getStoredSecondaryLanguages('test-deck-sec-cap')).toEqual(['he', 'es'])
  })

  it('treats a corrupt stored value as unset', async () => {
    await AsyncStorage.setItem('whocards-language-secondary:test-deck-sec-bad', 'not-json{')
    expect(await getStoredSecondaryLanguages('test-deck-sec-bad')).toEqual([])
  })

  it('does not touch the primary-language key', async () => {
    await setStoredLanguage('test-deck-sec-iso', 'en')
    await setStoredSecondaryLanguages('test-deck-sec-iso', ['he'])
    expect(await getStoredLanguage('test-deck-sec-iso')).toBe('en')
  })
})
