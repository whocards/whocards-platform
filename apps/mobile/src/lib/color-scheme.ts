import {useSyncExternalStore} from 'react'
import {Appearance} from 'react-native'
import {colorScheme} from 'react-native-css'

import type {ThemeSetting} from './theme-store'

/**
 * The app's single source of truth for "is this screen light or dark right now".
 *
 * NativeWind v4 exported a `colorScheme` observable whose setter took the full
 * `'system' | 'light' | 'dark'` triple. v5 dropped that export: the underlying
 * `react-native-css` observable is two-valued, seeded from
 * `Appearance.getColorScheme()` and kept in sync with it by a change listener.
 * The "system" mode is now the app's job, and this module is it.
 *
 * It deliberately does *not* call `Appearance.setColorScheme()`. That API
 * overrides what `Appearance.getColorScheme()` reports, so once used the real
 * OS preference becomes unreadable and "System" could never resolve back to it.
 * Writing the `react-native-css` observable instead drives every `dark:` class,
 * and `useColorScheme()` below reads the same value, so the classes and the
 * handful of JS-level conditionals (an Ionicons colour, a StatusBar style,
 * which Image source to load) can never disagree.
 */
let setting: ThemeSetting = 'system'

const listeners = new Set<() => void>()

/**
 * Dark-first fallback for the (rare) platforms that report no OS preference at
 * all — matches the app's historical, dark-only appearance rather than
 * assuming light.
 */
const resolve = () => (setting === 'system' ? (Appearance.getColorScheme() ?? 'dark') : setting)

const apply = () => {
  colorScheme.set(resolve())
  for (const listener of listeners) listener()
}

// Seed the observable immediately: `dark:` variants compare against its raw
// value, so leaving it null (which is what a platform with no preference
// reports) would make both `dark:` and its light-mode counterpart miss.
apply()

/**
 * `react-native-css` mirrors OS appearance changes straight into its observable,
 * which would silently drop a manual override. Re-assert ours afterwards — this
 * listener is registered second, because importing this module runs theirs first.
 */
Appearance.addChangeListener(() => apply())

/** Applies (and remembers) a Theme setting. Persistence lives in theme-store.ts. */
export const setColorScheme = (next: ThemeSetting): void => {
  setting = next
  apply()
}

/** The effective scheme right now. Never null. */
export const getColorScheme = () => colorScheme.get() ?? resolve()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Re-renders on every scheme change, whether from the OS or from Settings.
 * The third argument is the server snapshot: app.json declares `web.output:
 * "static"`, and React rejects a server render of useSyncExternalStore without one.
 */
export const useColorScheme = () => useSyncExternalStore(subscribe, getColorScheme, getColorScheme)

/** Shorthand for the overwhelmingly common `useColorScheme() === 'dark'`. */
export const useIsDark = () => useColorScheme() === 'dark'
