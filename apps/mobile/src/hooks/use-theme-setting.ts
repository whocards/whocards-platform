import {useCallback, useEffect, useState} from 'react'
import {EVENTS, track} from '@whocards/observability/events'

import {setColorScheme, useColorScheme} from '@/lib/color-scheme'
import {getStoredTheme, setStoredTheme} from '@/lib/theme-store'
import type {ThemeSetting} from '@/lib/theme-store'

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
  const [theme, setTheme] = useState<ThemeSetting>('system')
  const resolvedScheme = useColorScheme()

  useEffect(() => {
    void getStoredTheme().then((stored) => {
      setColorScheme(stored)
      setTheme(stored)
    })
  }, [])

  const select = useCallback((next: ThemeSetting) => {
    setColorScheme(next)
    setTheme(next)
    void setStoredTheme(next)
    track({name: EVENTS.THEME_CHANGED, props: {theme: next}})
  }, [])

  return {theme, resolvedScheme, select}
}
