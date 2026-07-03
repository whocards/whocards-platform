/**
 * Tests for src/hooks/use-internal-marker.ts — the hidden dev marker (issue
 * #178): restoring a persisted flag on mount, toggling it, persisting the new
 * value, registering/unregistering the PostHog super property via
 * `setInternalMarker`, and showing a confirmation Alert on every toggle (the
 * "clear visual confirmation" the marker needs since it has no other UI).
 *
 * `internal-store.ts` runs for real (only AsyncStorage is mocked) — this
 * hook's whole job is composing persistence + the PostHog call + the Alert,
 * so mocking the store away would test nothing. `setInternalMarker` and
 * `Alert.alert` are spied so the test stays hermetic (no real PostHog client,
 * no real system alert).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

const mockSetInternalMarker = jest.fn()
jest.mock('@/lib/observability', () => ({
  setInternalMarker: (...args: unknown[]) => mockSetInternalMarker(...args),
}))

import {act, renderHook, waitFor} from '@testing-library/react-native'
import {Alert} from 'react-native'

import {useInternalMarker} from '../hooks/use-internal-marker'
import {getStoredInternal, setStoredInternal} from '../lib/internal-store'

describe('useInternalMarker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })

  it('starts off, and stays off, when nothing has ever been persisted', async () => {
    const {result} = renderHook(() => useInternalMarker())
    expect(result.current.internal).toBe(false)
    await waitFor(() => expect(getStoredInternal()).resolves.toBe(false))
    expect(result.current.internal).toBe(false)
    expect(mockSetInternalMarker).not.toHaveBeenCalled()
  })

  it('restores a persisted "on" marker on mount and re-applies it to PostHog', async () => {
    await setStoredInternal(true)
    const {result} = renderHook(() => useInternalMarker())
    await waitFor(() => expect(result.current.internal).toBe(true))
    expect(mockSetInternalMarker).toHaveBeenCalledWith(true)
  })

  it('toggle() turns the marker on, persists it, registers with PostHog, and confirms via Alert', async () => {
    // explicit, like theme-store's tests — an earlier test in this file may have
    // left the module-level cache (internal-store.ts) warm at `true`
    await setStoredInternal(false)
    const {result} = renderHook(() => useInternalMarker())
    await waitFor(() => expect(result.current.internal).toBe(false))

    act(() => result.current.toggle())

    expect(result.current.internal).toBe(true)
    expect(await getStoredInternal()).toBe(true)
    expect(mockSetInternalMarker).toHaveBeenCalledWith(true)
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('ON'), expect.any(String))
  })

  it('toggle() again turns the marker back off and unregisters with PostHog', async () => {
    await setStoredInternal(true)
    const {result} = renderHook(() => useInternalMarker())
    await waitFor(() => expect(result.current.internal).toBe(true))
    mockSetInternalMarker.mockClear()

    act(() => result.current.toggle())

    expect(result.current.internal).toBe(false)
    expect(await getStoredInternal()).toBe(false)
    expect(mockSetInternalMarker).toHaveBeenCalledWith(false)
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('OFF'), expect.any(String))
  })
})
