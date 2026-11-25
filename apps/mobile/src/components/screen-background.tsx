import {Image} from 'expo-image'
import {useEffect} from 'react'
import type {ReactNode} from 'react'
import {StyleSheet, View} from 'react-native'
import type {SharedValue} from 'react-native-reanimated'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import {colors} from '@whocards/tokens'

import {env} from '@/env'
import {useIsDark} from '@/lib/color-scheme'
// Rasterized from the website's public/background.svg (the bg-hero texture).
// Dark is the original (dark-only) asset; light is a recolored variant for the
// Theme Display setting (issue #163) — see docs/design/163-light-mode/proposal.md.
const textureDark = require('../../assets/images/background.png')
const textureLight = require('../../assets/images/background-light.png')
// Mid-tone table variant (owner, live session): the Pick a Card table in dark
// theme — lighter than the dark canvas, darker than the light one.
const textureMid = require('../../assets/images/background-mid.png')
const MID_BASE = '#332b4a'

type ScreenBackgroundProps = {
  children: ReactNode
  /** optional 0–1 opacity for the texture (e.g. to fade it in on first launch) */
  textureOpacity?: SharedValue<number>
  /**
   * Table variant (owner, live session 2026-07-03): the Pick a Card table —
   * light canvas in light theme, mid-tone in dark theme (full light was too
   * jarring against dark chrome).
   */
  table?: boolean
}

/**
 * Full-screen WhoCards backdrop: the brand hero texture over a solid base. Uses
 * expo-image (memory-efficient decode + cache) absolutely filled behind the
 * content, since expo-image has no `ImageBackground` equivalent. The base colour
 * is always painted, so a `textureOpacity` fade reveals the texture over the
 * solid base. Follows the Theme Display setting (issue #163) — every caller
 * themes now, including Play and Pick a Card (issue #173): the Card is the
 * brand object and stays dark in both themes, but the chrome/canvas around it
 * follows the theme like every other screen. Callers that need a Card to stay
 * dark regardless of theme paint their own small dark panel behind it instead
 * of forcing this whole canvas dark (see `app/play/[deck].tsx`).
 */
const StaticScreenBackground = ({children, textureOpacity, table}: ScreenBackgroundProps) => {
  const isDark = useIsDark()
  const midTable = table && isDark

  const textureStyle = useAnimatedStyle(() => ({
    opacity: textureOpacity ? textureOpacity.get() : 1,
  }))

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: midTable ? MID_BASE : isDark ? colors.darkest : colors.canvasLight,
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, textureStyle]} pointerEvents="none">
        <Image
          source={midTable ? textureMid : isDark ? textureDark : textureLight}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {children}
    </View>
  )
}

// Prototype (issue #195): docs/design/195-animated-background/proposal.md.
// The light PNG bakes the maze in at 0.28 over canvasLight, so fading the image over canvasLight scales the maze alone.
const DRIFT_LOW = 0.22 / 0.28
const DRIFT_MS = 20_000
const CROSSFADE_MS = 600

const AnimatedScreenBackground = ({children, textureOpacity, table}: ScreenBackgroundProps) => {
  const isDark = useIsDark()
  const reduceMotion = useReducedMotion()
  const darkness = useSharedValue(isDark ? 1 : 0)
  const drift = useSharedValue(1)

  useEffect(() => {
    darkness.set(withTiming(isDark ? 1 : 0, {duration: reduceMotion ? 0 : CROSSFADE_MS}))
  }, [darkness, isDark, reduceMotion])

  useEffect(() => {
    // Light only: the dark canvas's treatment is its own decision.
    drift.set(
      isDark || reduceMotion
        ? 1
        : withRepeat(
            withTiming(DRIFT_LOW, {duration: DRIFT_MS, easing: Easing.inOut(Easing.sin)}),
            -1,
            true
          )
    )
    return () => cancelAnimation(drift)
  }, [drift, isDark, reduceMotion])

  const textureStyle = useAnimatedStyle(() => ({
    opacity: textureOpacity ? textureOpacity.get() : 1,
  }))
  const driftStyle = useAnimatedStyle(() => ({opacity: drift.get()}))
  const darkStyle = useAnimatedStyle(() => ({opacity: darkness.get()}))

  return (
    <View style={{flex: 1, backgroundColor: colors.canvasLight}}>
      <Animated.View style={[StyleSheet.absoluteFill, textureStyle]} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
          <Image source={textureLight} contentFit="cover" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          darkStyle,
          {backgroundColor: table ? MID_BASE : colors.darkest},
        ]}
        pointerEvents="none"
      >
        <Animated.View style={[StyleSheet.absoluteFill, textureStyle]}>
          <Image
            source={table ? textureMid : textureDark}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
      {children}
    </View>
  )
}

export const ScreenBackground = env.EXPO_PUBLIC_ANIMATED_BACKGROUND
  ? AnimatedScreenBackground
  : StaticScreenBackground
