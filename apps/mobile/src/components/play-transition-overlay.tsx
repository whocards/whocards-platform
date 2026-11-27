import {Image} from 'expo-image'
import {useEffect, useState} from 'react'
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native'
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import {LINE_HEIGHT_RATIO} from '@/components/question-text'
import {MOTION_DURATION, MOTION_EASING, motionDuration} from '@/lib/motion'
import type {PlayTargetMetrics, PlayTransitionEvent} from '@/lib/play-transition'
import {
  clearPlayTransition,
  getPlayTargetMetrics,
  subscribePlayTargetMetrics,
  subscribePlayTransition,
} from '@/lib/play-transition'

const logo = require('../../assets/images/logo.png')

// Exact pixel-sampled colour of glyph "?" inside logo.png's yellow → violet gradient.
const LOGO_QMARK_COLOR = '#de9c93'
// Exact horizontal center fraction of glyph "?" inside logo.png (504 / 1200 = 0.420).
const LOGO_QMARK_X_RATIO = 0.42
const CARD_ASPECT = 0.72
const HINT_SPACE = 40
const HINT_GAP = 28
const QUESTION_MARK_SIZE = 60
const QUESTION_MARK_LINE_HEIGHT = QUESTION_MARK_SIZE * LINE_HEIGHT_RATIO
// CardBack wordmark font size (matches unified-player.tsx CardBack).
const CARDBACK_WORDMARK_FONT = 26

/**
 * Root-level overlay for the bidirectional 5B Home ↔ Play transition:
 * - `kind: 'qmark'` (Classic or open Card): the "?" glides between WHO?CARDS and
 *   the corner "?" while morphing color (#de9c93 ↔ #c058d2), opacity, and scale.
 * - `kind: 'deck'` (face-down Pick a Card Deck): the entire WHO?CARDS logo glides,
 *   scales, and cross-morphs between logo.png's gradient and CardBack's exact 26pt
 *   wordmark so the handoff at scale = 1.000 has 0.0px jump.
 */
export const PlayTransitionOverlay = () => {
  const [event, setEvent] = useState<PlayTransitionEvent | null>(null)
  const [metrics, setMetrics] = useState<PlayTargetMetrics>(() => getPlayTargetMetrics())
  const reduceMotion = useReducedMotion()
  const {width: winWidth, height: winHeight} = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // progress: 0 = Home position, 1 = Play position (0→1 on enter, 1→0 on exit).
  const progress = useSharedValue(0)

  useEffect(() => subscribePlayTransition(setEvent), [])
  useEffect(() => subscribePlayTargetMetrics(setMetrics), [])

  useEffect(() => {
    if (!event) return
    const dur = motionDuration(MOTION_DURATION.homeToPlay, reduceMotion)
    if (dur === 0) {
      clearPlayTransition(event.id)
      return
    }
    const isExit = event.direction === 'exit'
    progress.set(isExit ? 1 : 0)
    const eventId = event.id
    progress.set(
      withTiming(isExit ? 0 : 1, {duration: dur, easing: MOTION_EASING.standard}, (finished) => {
        'worklet'
        if (finished) runOnJS(clearPlayTransition)(eventId)
      })
    )
  }, [event, progress, reduceMotion])

  // Target coordinates matching UnifiedPlayer's exact measured layout (updates live if
  // UnifiedPlayer mounts mid-flight on the very first launch).
  const barH = event?.bottomBarH ?? metrics.bottomBarH ?? 74 + Math.max(insets.bottom, 10)
  const measuredW = winWidth - 64
  const measuredH = winHeight - insets.top - barH
  const cardWidth = Math.round(
    Math.min(measuredW, (measuredH - HINT_SPACE - HINT_GAP) * CARD_ASPECT)
  )
  const cardHeight = Math.round(cardWidth / CARD_ASPECT)
  const cardLeft = (winWidth - cardWidth) / 2
  const cardTop = insets.top + (measuredH - cardHeight - HINT_SPACE - HINT_GAP) / 2

  const rect = event?.logoRect ?? {x: 0, y: 0, width: 280, height: 53}

  // "?" endpoint anchored to the EXACT right/bottom edge of UnifiedPlayer's corner "?".
  // On enter, refine live with metrics.classicQ as soon as UnifiedPlayer lays out.
  const qAnchor =
    event?.direction === 'exit' ? event.playQAnchor : (metrics.classicQ ?? event?.playQAnchor)
  const playQRight = qAnchor?.right ?? 28
  const playQBottom = qAnchor?.bottom ?? barH + 20
  const playQOpacity = qAnchor?.opacity ?? 0.28
  const playQScale = qAnchor?.scale ?? 1.08
  const playQWidth = qAnchor?.width ?? 28
  const playQHeight = qAnchor?.height ?? QUESTION_MARK_LINE_HEIGHT

  // Home "?" center vs Play "?" center.
  const homeQCenterX = rect.x + rect.width * LOGO_QMARK_X_RATIO
  const homeQCenterY = rect.y + rect.height * 0.5
  const playQCenterX = winWidth - playQRight - playQWidth * 0.5
  const playQCenterY = winHeight - playQBottom - playQHeight * 0.5

  const qMarkStyle = useAnimatedStyle(() => {
    const t = progress.get()
    return {
      color: interpolateColor(t, [0, 0.75], [LOGO_QMARK_COLOR, colors.primary.dark]),
      opacity: interpolate(t, [0, 1], [1, playQOpacity], 'clamp'),
      transform: [
        {translateX: interpolate(t, [0, 1], [homeQCenterX - playQCenterX, 0], 'clamp')},
        {translateY: interpolate(t, [0, 1], [homeQCenterY - playQCenterY, 0], 'clamp')},
        {scale: interpolate(t, [0, 1], [rect.height / QUESTION_MARK_SIZE, playQScale], 'clamp')},
      ],
    }
  })

  // Deck target: CardBack's exact measured WHO?CARDS wordmark rect (bottom: 20, right: 20, fontSize: 26).
  // Render the target wordmark at its real native 26pt size landing at scale = 1.000 so the
  // handoff to CardBack is bit-for-bit identical (0.0px shift, zero font-hinting jump).
  const deckWordmark =
    event?.direction === 'exit'
      ? (event.deckWordmark ?? metrics.deckWordmark)
      : (metrics.deckWordmark ?? event?.deckWordmark)
  const wordmarkW = deckWordmark?.width ?? CARDBACK_WORDMARK_FONT * 4.55
  const wordmarkH = deckWordmark?.height ?? CARDBACK_WORDMARK_FONT * 1.15
  const wordmarkX = deckWordmark?.x ?? cardLeft + cardWidth - 1 - 20 - wordmarkW
  const wordmarkY = deckWordmark?.y ?? cardTop + cardHeight - 1 - 20 - wordmarkH

  const startLogoCX = rect.x + rect.width / 2
  const startLogoCY = rect.y + rect.height / 2
  const endLogoCX = wordmarkX + wordmarkW / 2
  const endLogoCY = wordmarkY + wordmarkH / 2
  const gradientEndScale = wordmarkW / Math.max(1, rect.width)
  const wordmarkStartScale = rect.width / Math.max(1, wordmarkW)

  // Both layers travel the exact same center-to-center trajectory:
  // - gradientLogo starts at scale 1.0 (pixel-identical to Home logo.png) and shrinks to wordmark size.
  // - cardBackWordmark starts scaled up to Home logo size and lands at scale 1.000 (pixel-identical to CardBack).
  const gradientWrapStyle = useAnimatedStyle(() => {
    const t = progress.get()
    return {
      opacity: interpolate(t, [0.35, 0.85], [1, 0], 'clamp'),
      transform: [
        {translateX: interpolate(t, [0, 1], [0, endLogoCX - startLogoCX], 'clamp')},
        {translateY: interpolate(t, [0, 1], [0, endLogoCY - startLogoCY], 'clamp')},
        {scale: interpolate(t, [0, 1], [1, gradientEndScale], 'clamp')},
      ],
    }
  })

  const wordmarkWrapStyle = useAnimatedStyle(() => {
    const t = progress.get()
    return {
      opacity: interpolate(t, [0.08, 0.42], [0, 1], 'clamp'),
      transform: [
        {translateX: interpolate(t, [0, 1], [startLogoCX - endLogoCX, 0], 'clamp')},
        {translateY: interpolate(t, [0, 1], [startLogoCY - endLogoCY, 0], 'clamp')},
        {scale: interpolate(t, [0, 1], [wordmarkStartScale, 1], 'clamp')},
      ],
    }
  })

  if (!event) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {event.kind === 'deck' ? (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: wordmarkX,
                top: wordmarkY,
                width: wordmarkW,
                height: wordmarkH,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
              },
              wordmarkWrapStyle,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{fontSize: CARDBACK_WORDMARK_FONT}}
              className="font-title text-yellow-400"
            >
              WHO<Text className="text-primary-dark">?</Text>
              <Text className="text-white">CARDS</Text>
            </Text>
          </Animated.View>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              },
              gradientWrapStyle,
            ]}
          >
            <Image source={logo} contentFit="contain" style={StyleSheet.absoluteFill} />
          </Animated.View>
        </>
      ) : (
        <Animated.Text
          className="font-title"
          style={[
            {
              position: 'absolute',
              right: playQRight,
              bottom: playQBottom,
              fontSize: QUESTION_MARK_SIZE,
              lineHeight: QUESTION_MARK_LINE_HEIGHT,
            },
            qMarkStyle,
          ]}
        >
          ?
        </Animated.Text>
      )}
    </View>
  )
}
