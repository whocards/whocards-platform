import {useCallback, useEffect} from 'react'
import {useReducedMotion} from 'react-native-reanimated'
import {EVENTS, track} from '@whocards/observability/events'

import {setColorScheme, useColorScheme, useThemeSettingValue} from '@/lib/color-scheme'
import {MOTION_DURATION, motionDuration} from '@/lib/motion'
import {getStoredTheme, setStoredTheme} from '@/lib/theme-store'
import type {ThemeSetting} from '@/lib/theme-store'

import {crossfadeWindow} from '../../modules/theme-crossfade'

/**
 * The Theme Display setting (issue #163, CONTEXT.md — presentation only,
 * never affects which Card is drawn or whose progress is remembered):
 * System-follow by default, with a manual Light/Dark override.
 *
 * The scheme itself lives in `@/lib/color-scheme`, which follows the OS
 * Appearance out of the box — this hook's job is just to restore a
 * previously-chosen manual override on boot and to apply/persist a new choice.
 *
 * `resolvedScheme` is the live, effective 'light' | 'dark' for the rare
 * JS-level conditional (an `Ionicons` color, a `StatusBar` style, which
 * `Image` source to load) that can't be expressed as a `dark:` class —
 * callers should read it from here rather than calling `useColorScheme()`
 * a second time, so there's one source of truth for "is this screen dark
 * right now."
 */
export const useThemeSetting = () => {
  const theme = useThemeSettingValue()
  const resolvedScheme = useColorScheme()

  useEffect(() => {
    void getStoredTheme().then(setColorScheme)
  }, [])

  const reduceMotion = useReducedMotion()
  const select = useCallback(
    (next: ThemeSetting) => {
      const fade = crossfadeWindow(motionDuration(MOTION_DURATION.theme, reduceMotion))
      const apply = () => setColorScheme(next)
      if (fade) void fade.then(apply, apply)
      else apply()
      void setStoredTheme(next)
      track({name: EVENTS.THEME_CHANGED, props: {theme: next}})
    },
    [reduceMotion]
  )

  return {theme, resolvedScheme, select}
}
