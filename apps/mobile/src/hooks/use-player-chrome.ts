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
 * Auto-hiding player chrome: a single 0→1 progress slides the bars in and out —
 * the top bar up off the top edge, the bottom bar down off the bottom edge (a
 * slide, not a fade). Measured bar heights drive both the off-screen slide
 * distance and the card's padding, so the question never sits under a bar even
 * though the gesture layer runs full-bleed behind them. Shared by every player.
 */
export const usePlayerChrome = () => {
  const reduceMotion = useReducedMotion()
  const chromeProgress = useSharedValue(1)
  const [chromeShown, setChromeShown] = useState(true)
  const [topBarH, setTopBarH] = useState(0)
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

  useEffect(() => {
    revealChrome()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealChrome])

  const onTopBarLayout = useCallback((event: LayoutChangeEvent) => {
    setTopBarH(event.nativeEvent.layout.height)
  }, [])
  const onBottomBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBottomBarH(event.nativeEvent.layout.height)
  }, [])

  // top bar slides up off the top edge; bottom bar slides down off the bottom edge.
  // topBarH/bottomBarH are captured per render, so the slide distance corrects once
  // the bars measure.
  const topChromeStyle = useAnimatedStyle(() => ({
    transform: [{translateY: interpolate(chromeProgress.get(), [0, 1], [-topBarH, 0])}],
  }))
  const bottomChromeStyle = useAnimatedStyle(() => ({
    transform: [{translateY: interpolate(chromeProgress.get(), [0, 1], [bottomBarH, 0])}],
  }))

  return {
    chromeShown,
    revealChrome,
    topBarH,
    bottomBarH,
    onTopBarLayout,
    onBottomBarLayout,
    topChromeStyle,
    bottomChromeStyle,
  }
}
