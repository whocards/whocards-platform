/**
 * Tests for src/lib/device-id.ts
 *
 * Covers: first-run UUID generation + persistence, stable id on re-read (cache
 * hit), stable id after cache cleared (storage hit), and uniqueness.
 *
 * Strategy: use jest.isolateModules() to get a fresh module (with an empty
 * in-memory cache) for each test. The AsyncStorage mock is declared at the
 * top level and reset in beforeEach.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const mockRandomUUID = jest.fn(() => 'mock-uuid-1234')
jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

const DEVICE_ID_KEY = 'whocards-device-id'

beforeEach(async () => {
  await AsyncStorage.clear()
  mockRandomUUID.mockClear()
  mockRandomUUID.mockReturnValue('mock-uuid-1234')
})

/** Returns a fresh getDeviceId that has an empty in-memory cache. */
const freshGetDeviceId = (): (() => Promise<string>) => {
  let fn!: () => Promise<string>
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fn = require('../lib/device-id').getDeviceId
  })
  return fn
}

describe('getDeviceId', () => {
  it('mints a new UUID on first call and persists it', async () => {
    const getDeviceId = freshGetDeviceId()
    const id = await getDeviceId()
    expect(id).toBe('mock-uuid-1234')
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY)
    expect(stored).toBe('mock-uuid-1234')
  })

  it('returns the same id on repeated calls within one session (cache hit)', async () => {
    const getDeviceId = freshGetDeviceId()
    const id1 = await getDeviceId()
    const id2 = await getDeviceId()
    expect(id1).toBe(id2)
    // randomUUID should only be called once (second call hits the in-memory cache).
    expect(mockRandomUUID).toHaveBeenCalledTimes(1)
  })

  it('returns the stored id on re-import (cache miss, storage hit)', async () => {
    // Seed storage with an existing id.
    await AsyncStorage.setItem(DEVICE_ID_KEY, 'existing-device-id')

    const getDeviceId = freshGetDeviceId()
    const id = await getDeviceId()
    expect(id).toBe('existing-device-id')
    // Should not have generated a new UUID.
    expect(mockRandomUUID).not.toHaveBeenCalled()
  })

  it('uses the key whocards-device-id when minting', async () => {
    const getDeviceId = freshGetDeviceId()
    await getDeviceId()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(DEVICE_ID_KEY, 'mock-uuid-1234')
  })

  it('does not call AsyncStorage.setItem when a stored id exists', async () => {
    await AsyncStorage.setItem(DEVICE_ID_KEY, 'existing-device-id')
    jest.clearAllMocks() // clear the setItem call from the seed

    const getDeviceId = freshGetDeviceId()
    await getDeviceId()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })
})
