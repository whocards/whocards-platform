/**
 * Tests for src/hooks/use-theme-setting.ts — the Theme Display setting's
 * (issue #163) tri-state resolution: 'system' | 'light' | 'dark', restoring a
 * persisted override on mount, and the live `resolvedScheme` ('light' |
 * 'dark') NativeWind exposes for the JS-level conditionals that can't be
 * expressed as a `dark:` class (an `Ionicons` color, the Library screen's
 * `<StatusBar>` override — see index.tsx).
 *
 * `theme-store.ts` and `nativewind`'s `colorScheme`/`useColorScheme` run for
 * real (only `AsyncStorage` is mocked) — this hook's whole job is composing
 * the two, so mocking either away would test nothing.
 *
 * Unlike theme-store.test.ts, this file does NOT `jest.resetModules()`
 * between tests: doing that alongside `renderHook` breaks React's internal
 * dispatcher (the isolated registry ends up with a second `react` instance
 * that `react-test-renderer` doesn't share). Instead, every test other than
 * the first explicitly calls `setStoredTheme()` before rendering — which
 * unconditionally overwrites theme-store's module-level cache — so each test
 * still starts from a known, deterministic persisted value regardless of
 * what earlier tests left behind. The one truly cache-cold case (nothing
 * ever persisted) is exercised by the first test in the file, before any
 * `setStoredTheme` call has run.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import {act, renderHook, waitFor} from '@testing-library/react-native'

import {useThemeSetting} from '../hooks/use-theme-setting'
import {getStoredTheme, setStoredTheme} from '../lib/theme-store'

describe('useThemeSetting', () => {
  it('starts, and stays, on "system" when nothing has ever been persisted', async () => {
    const {result} = renderHook(() => useThemeSetting())
    expect(result.current.theme).toBe('system')
    // let the boot effect's getStoredTheme() promise settle before asserting it held
    await waitFor(() => expect(getStoredTheme()).resolves.toBe('system'))
    expect(result.current.theme).toBe('system')
  })

  it('starts on "system" before a persisted "dark" override resolves, then restores it', async () => {
    await setStoredTheme('dark')
    const {result} = renderHook(() => useThemeSetting())
    expect(result.current.theme).toBe('system')
    await waitFor(() => expect(result.current.theme).toBe('dark'))
    expect(result.current.resolvedScheme).toBe('dark')
  })

  it('restores a persisted "light" override on mount', async () => {
    await setStoredTheme('light')
    const {result} = renderHook(() => useThemeSetting())
    await waitFor(() => expect(result.current.theme).toBe('light'))
    expect(result.current.resolvedScheme).toBe('light')
  })

  it('select() applies a manual "light" override immediately, resolvedScheme included', async () => {
    await setStoredTheme('dark') // start from the opposite override
    const {result} = renderHook(() => useThemeSetting())
    await waitFor(() => expect(result.current.theme).toBe('dark'))

    act(() => result.current.select('light'))

    expect(result.current.theme).toBe('light')
    expect(result.current.resolvedScheme).toBe('light')
  })

  it('select() applies a manual "dark" override immediately, resolvedScheme included', async () => {
    await setStoredTheme('light')
    const {result} = renderHook(() => useThemeSetting())
    await waitFor(() => expect(result.current.theme).toBe('light'))

    act(() => result.current.select('dark'))

    expect(result.current.theme).toBe('dark')
    expect(result.current.resolvedScheme).toBe('dark')
  })

  it('select() persists the choice so a later boot restores it', async () => {
    const {result} = renderHook(() => useThemeSetting())
    await waitFor(() => expect(result.current.theme).not.toBeUndefined())

    act(() => result.current.select('dark'))

    expect(await getStoredTheme()).toBe('dark')
  })

  it('selecting "system" again clears a manual override back to system-follow', async () => {
    await setStoredTheme('light')
    const {result} = renderHook(() => useThemeSetting())
    await waitFor(() => expect(result.current.theme).toBe('light'))

    act(() => result.current.select('system'))

    expect(result.current.theme).toBe('system')
    expect(await getStoredTheme()).toBe('system')
  })
})
