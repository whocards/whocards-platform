/**
 * src/lib/color-scheme.ts — the module that turns the stored Theme (a Display
 * setting, CONTEXT.md) into the light/dark value every `dark:` class and every
 * JS-level colour conditional reads.
 *
 * Two of its behaviours are invisible until they break in someone's hands:
 *
 *   - the `?? 'dark'` fallback for a platform that reports no OS preference at
 *     all, without which `dark:` and its light-mode counterpart would *both*
 *     miss and the app would render unstyled;
 *   - re-asserting a manual override after an OS appearance flip. react-native-css
 *     registers its own `Appearance` listener that mirrors the OS value straight
 *     into the observable, so a phone that switches to Dark at sunset would
 *     silently drag a player who chose Light along with it.
 *
 * Both happen at *import* time — the module seeds the observable and registers
 * its listener as it loads — so each case gets its own module registry.
 */
import {Appearance} from 'react-native'
import type {colorScheme} from 'react-native-css'

import type {getColorScheme, setColorScheme} from '@/lib/color-scheme'

type Api = {getColorScheme: typeof getColorScheme; setColorScheme: typeof setColorScheme}
type Observable = typeof colorScheme
type OsScheme = 'light' | 'dark' | null

/** A fresh copy of the module, loaded against a stubbed OS preference. */
const load = (initialOsScheme: OsScheme) => {
  let os = initialOsScheme
  let api!: Api
  let observable!: Observable
  const osListeners: (() => void)[] = []

  const stubOsPreference = (appearance: typeof Appearance) => {
    jest.spyOn(appearance, 'getColorScheme').mockImplementation(() => os)
    jest.spyOn(appearance, 'addChangeListener').mockImplementation((listener) => {
      // 'unspecified' is how the change event spells "no OS preference"; the
      // getter above spells the same thing null.
      osListeners.push(() => listener({colorScheme: os ?? 'unspecified'}))
      return {remove: () => undefined}
    })
  }

  // Synchronous requires, not `await import()`: only a synchronous require lands
  // in the registry isolateModules swaps in, and the stub has to go on between
  // requiring react-native and requiring the module that reads it on the way up.
  jest.isolateModules(() => {
    stubOsPreference(jest.requireActual<{Appearance: typeof Appearance}>('react-native').Appearance)
    observable = jest.requireActual<{colorScheme: Observable}>('react-native-css').colorScheme
    api = jest.requireActual<Api>('@/lib/color-scheme')
  })

  // The same stub again, on this file's own registry. `react-native`'s index is
  // a lazy-getter object — `Appearance` re-`require`s the module on every
  // property access, through whichever registry is live at that moment — so
  // color-scheme.ts reads the isolated copy while it is being imported and this
  // one for every call afterwards. Stubbing only the first leaves it reading the
  // host's real (null) preference from the second assertion onwards.
  stubOsPreference(Appearance)

  /**
   * One OS-level appearance flip, in the order the device produces it:
   * react-native-css's own listener mirrors the new value into the observable
   * first (it was registered first, when it was imported), then ours runs.
   */
  const flipOsTo = (next: 'light' | 'dark') => {
    os = next
    observable.set(next)
    for (const listener of osListeners) listener()
  }

  return {...api, observable, flipOsTo}
}

afterEach(() => jest.restoreAllMocks())

describe('color-scheme — resolving the OS preference', () => {
  it('follows the OS while the setting is System', () => {
    const {getColorScheme} = load('light')
    expect(getColorScheme()).toBe('light')
  })

  it('falls back to dark when the OS reports no preference', () => {
    const {getColorScheme, observable} = load(null)

    expect(getColorScheme()).toBe('dark')
    // Seeded, not merely computed: `dark:` compares against the observable's
    // own value, so leaving it null would make every variant miss.
    expect(observable.get()).toBe('dark')
  })

  it('follows the OS across a flip while the setting is System', () => {
    const {getColorScheme, flipOsTo} = load('light')

    flipOsTo('dark')

    expect(getColorScheme()).toBe('dark')
  })
})

describe('color-scheme — manual overrides', () => {
  it('overrides the OS preference', () => {
    const {getColorScheme, setColorScheme} = load('dark')

    setColorScheme('light')

    expect(getColorScheme()).toBe('light')
  })

  it('re-asserts the override after an OS appearance flip', () => {
    const {getColorScheme, setColorScheme, observable, flipOsTo} = load('light')
    setColorScheme('light')

    // Sunset: the phone switches itself to Dark. react-native-css writes that
    // into the observable; our listener has to write the override back.
    flipOsTo('dark')

    expect(getColorScheme()).toBe('light')
    expect(observable.get()).toBe('light')
  })

  it('hands control back to the OS when the setting returns to System', () => {
    const {getColorScheme, setColorScheme, flipOsTo} = load('light')
    setColorScheme('dark')

    setColorScheme('system')
    expect(getColorScheme()).toBe('light')

    flipOsTo('dark')
    expect(getColorScheme()).toBe('dark')
  })
})
