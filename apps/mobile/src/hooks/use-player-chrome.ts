import {useCallback, useEffect, useRef, useState} from 'react'
import type {LayoutChangeEvent} from 'react-native'
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

const CHROME_HIDE_MS = 3000

/**
 * Auto-hiding player chrome: a single 0→1 progress slides the bottom bar down
 * off the bottom edge (a slide, not a fade). The bar's measured height drives
 * both its off-screen slide distance and the card's bottom padding, so the
 * question never sits under it even though the gesture layer runs full-bleed
 * behind it. Shared by every player.
 *
 * There used to be a matching top bar (the floating close chip) with the same
 * treatment; issue #186 moved Exit into the bottom bar and freed the top edge
 * entirely, so the top-bar half of this hook went with it — re-add it here if
 * a player ever needs a real top bar again.
 */
export const usePlayerChrome = () => {
  const reduceMotion = useReducedMotion()
  const chromeProgress = useSharedValue(1)
  const [chromeShown, setChromeShown] = useState(true)
  const [bottomBarH, setBottomBarH] = useState(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setChromeVisible = useCallback(
    (to: number) => {
      setChromeShown(to === 1)
      chromeProgress.set(withTiming(to, {duration: reduceMotion ? 0 : 300}))
    },
    [chromeProgress, reduceMotion]
  )

  const revealChrome = useCallback(() => {
    setChromeVisible(1)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setChromeVisible(0), CHROME_HIDE_MS)
  }, [setChromeVisible])

  /* oxlint-disable react/set-state-in-effect -- intentional show-chrome-on-mount + auto-hide timer; restructuring needs on-device verification */
  useEffect(() => {
    revealChrome()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealChrome])
  /* oxlint-enable react/set-state-in-effect */

  const onBottomBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBottomBarH(event.nativeEvent.layout.height)
  }, [])

  // bottom bar slides down off the bottom edge; bottomBarH is captured per
  // render, so the slide distance corrects once the bar measures.
  const bottomChromeStyle = useAnimatedStyle(() => ({
    transform: [{translateY: interpolate(chromeProgress.get(), [0, 1], [bottomBarH, 0])}],
  }))

  return {
    chromeShown,
    revealChrome,
    bottomBarH,
    onBottomBarLayout,
    bottomChromeStyle,
  }
}
