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
import type {PlayTransitionEvent} from '@/lib/play-transition'
import {clearPlayTransition, subscribePlayTransition} from '@/lib/play-transition'

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
 *   scales, and cross-morphs between logo.png's gradient and CardBack's flat brand wordmark.
 */
export const PlayTransitionOverlay = () => {
  const [event, setEvent] = useState<PlayTransitionEvent | null>(null)
  const reduceMotion = useReducedMotion()
  const {width: winWidth, height: winHeight} = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // progress: 0 = Home position, 1 = Play position (0→1 on enter, 1→0 on exit).
  const progress = useSharedValue(0)

  useEffect(() => subscribePlayTransition(setEvent), [])

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

  // Target coordinates matching UnifiedPlayer's exact layout.
  const barH = event?.bottomBarH ?? 74 + Math.max(insets.bottom, 10)
  const measuredW = winWidth - 64
  const measuredH = winHeight - insets.top - barH
  const cardWidth = Math.round(
    Math.min(measuredW, (measuredH - HINT_SPACE - HINT_GAP) * CARD_ASPECT)
  )
  const cardHeight = Math.round(cardWidth / CARD_ASPECT)
  const cardLeft = (winWidth - cardWidth) / 2
  const cardTop = insets.top + (measuredH - cardHeight - HINT_SPACE - HINT_GAP) / 2

  const rect = event?.logoRect ?? {x: 0, y: 0, width: 280, height: 53}

  // "?" endpoint anchored to the EXACT right/bottom edge of UnifiedPlayer's corner "?"
  // so the handoff at progress = 1 has 0px jump.
  const playQRight = event?.playQAnchor?.right ?? 28
  const playQBottom = event?.playQAnchor?.bottom ?? barH + 20
  const playQOpacity = event?.playQAnchor?.opacity ?? 0.28
  const playQScale = event?.playQAnchor?.scale ?? 1.08

  // Home "?" center vs Play "?" center (aptly "?" glyph at 60px is ~28px wide, 69px lineHeight).
  const homeQCenterX = rect.x + rect.width * LOGO_QMARK_X_RATIO
  const homeQCenterY = rect.y + rect.height * 0.5
  const playQCenterX = winWidth - playQRight - 14
  const playQCenterY = winHeight - playQBottom - QUESTION_MARK_LINE_HEIGHT * 0.5

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

  // Deck target: CardBack's bottom-right WHO?CARDS wordmark (bottom: 20, right: 20, fontSize: 26).
  // In aptly at 26px, "WHO?CARDS" measures ~118×28pt (CardBack right:20, bottom:20).
  const startLogoCX = rect.x + rect.width / 2
  const startLogoCY = rect.y + rect.height / 2
  const deckTextW = CARDBACK_WORDMARK_FONT * 4.55
  const deckTextH = CARDBACK_WORDMARK_FONT * 1.08
  const deckLogoScale = deckTextW / Math.max(1, rect.width)
  const endLogoCX = cardLeft + cardWidth - 20 - deckTextW / 2
  const endLogoCY = cardTop + cardHeight - 20 - deckTextH / 2

  const fullLogoWrapStyle = useAnimatedStyle(() => {
    const t = progress.get()
    return {
      transform: [
        {translateX: interpolate(t, [0, 1], [startLogoCX - endLogoCX, 0], 'clamp')},
        {translateY: interpolate(t, [0, 1], [startLogoCY - endLogoCY, 0], 'clamp')},
        {scale: interpolate(t, [0, 1], [1, deckLogoScale], 'clamp')},
      ],
    }
  })

  // Keep bottom wordmark at full opacity before top gradient fades out so combined alpha never dips pale.
  const cardBackWordmarkOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.05, 0.35], [0, 1], 'clamp'),
  }))

  const gradientLogoOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.35, 0.85], [1, 0], 'clamp'),
  }))

  if (!event) return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {event.kind === 'deck' ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: endLogoCX - rect.width / 2,
              top: endLogoCY - rect.height / 2,
              width: rect.width,
              height: rect.height,
              alignItems: 'center',
              justifyContent: 'center',
            },
            fullLogoWrapStyle,
          ]}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {alignItems: 'center', justifyContent: 'center', overflow: 'visible'},
              cardBackWordmarkOpacity,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: Math.round(CARDBACK_WORDMARK_FONT / deckLogoScale),
                lineHeight: Math.round((CARDBACK_WORDMARK_FONT / deckLogoScale) * 1.12),
                includeFontPadding: false,
              }}
              className="font-title text-yellow-400"
            >
              WHO<Text className="text-primary-dark">?</Text>
              <Text className="text-white">CARDS</Text>
            </Text>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, gradientLogoOpacity]}>
            <Image source={logo} contentFit="contain" style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>
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
