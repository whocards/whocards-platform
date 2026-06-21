import {Ionicons} from '@expo/vector-icons'
import {Image} from 'expo-image'
import {Link} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {useCallback, useEffect, useRef, useState} from 'react'
import type {View as RNView} from 'react-native'
import {Text, useWindowDimensions, View} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import {SafeAreaView} from 'react-native-safe-area-context'
import {DEFAULT_DECK_SLUG, libraryDeck, resolveDeck} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {PressableScale} from '@/components/pressable-scale'
import {ScreenBackground} from '@/components/screen-background'
import {impact} from '@/lib/haptics'
import {trpc} from '@/lib/trpc'

// We launch with the original WhoCards deck; its content ships in-app for offline play.
const deck = resolveDeck(libraryDeck)
const logo = require('../../assets/images/logo.png')

// Logo dimensions — kept in sync with the splash `imageWidth` (app.json) so the mark
// is the same size in the splash and on the landing, and the handoff is seamless.
const LOGO_WIDTH = 280
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 226) / 1200)
// Entrance: the logo glides into place first (LOGO_MS), then the tagline/Play fade
// in (FADE_MS) so nothing crosses the moving logo. The background fades with the logo.
const LOGO_MS = 450
const FADE_MS = 350

export default function LandingScreen() {
  const [serverMeta, setServerMeta] = useState<{cards: number; languages: number} | null>(null)
  const {height: winHeight} = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  // --- splash → landing handoff ---
  // The native splash centres the logo on screen. We start our (identical) logo at
  // that same centre, hide the splash, then animate it up into its landing position
  // (logoShift 0) while the tagline / Play block and the background texture fade in.
  const logoShift = useSharedValue(0) // vertical px offset from the final landing spot
  const contentOpacity = useSharedValue(0) // tagline + bottom block
  const bgOpacity = useSharedValue(0) // background texture
  const logoRef = useRef<RNView>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    // offline-first: render the bundled numbers, silently reconcile with the API (ADR-0002)
    trpc.decks.manifest
      .query()
      .then((decks) => {
        const live = decks.find((entry) => entry.slug === DEFAULT_DECK_SLUG)
        if (live) setServerMeta({cards: live.questionCount, languages: live.languages.length})
      })
      .catch(() => undefined)
  }, [])

  const runEntrance = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    // reveal our view (logo already sitting where the splash logo was), then animate
    void SplashScreen.hideAsync()
    if (reduceMotion) {
      logoShift.set(0)
      contentOpacity.set(1)
      bgOpacity.set(1)
      return
    }
    // logo glides up + background fades in together; tagline/Play wait until the logo
    // has settled so they never overlap the moving mark
    logoShift.set(withTiming(0, {duration: LOGO_MS}))
    bgOpacity.set(withTiming(1, {duration: LOGO_MS}))
    contentOpacity.set(withDelay(LOGO_MS, withTiming(1, {duration: FADE_MS})))
  }, [reduceMotion, logoShift, contentOpacity, bgOpacity])

  // Keep the logo pinned to screen-centre (matching the splash) using the LATEST layout.
  // Re-measure on every onLayout until the entrance runs, so a late safe-area inset / font
  // metric / reflow can't strand the lift and snap the logo when the animation starts.
  const onLogoLayout = useCallback(() => {
    if (startedRef.current) return
    logoRef.current?.measureInWindow((_x, y, _w, h) => {
      if (!startedRef.current && h) logoShift.set(winHeight / 2 - (y + h / 2))
    })
  }, [winHeight, logoShift])

  // Run the entrance once, after a beat for layout + insets to settle (the splash covers
  // this; if measurement never resolved, the content still reveals — logo just won't fly).
  useEffect(() => {
    const t = setTimeout(runEntrance, 120)
    return () => clearTimeout(t)
  }, [runEntrance])

  const logoStyle = useAnimatedStyle(() => ({transform: [{translateY: logoShift.get()}]}))
  const contentStyle = useAnimatedStyle(() => ({opacity: contentOpacity.get()}))

  const cards = serverMeta?.cards ?? deck.questionIds.length
  const languages = serverMeta?.languages ?? deck.languages.length

  return (
    <ScreenBackground textureOpacity={bgOpacity}>
      <SafeAreaView className="flex-1 items-center justify-between px-8 pb-8 pt-16">
        <View className="flex-1 items-center justify-center">
          <Animated.View ref={logoRef} onLayout={onLogoLayout} style={logoStyle}>
            <Image
              source={logo}
              contentFit="contain"
              accessibilityLabel="WhoCards"
              // explicit width AND height — native sizes a required image to its
              // intrinsic pixels otherwise (aspectRatio alone only works on web)
              style={{width: LOGO_WIDTH, height: LOGO_HEIGHT}}
            />
          </Animated.View>
          <Animated.Text
            style={contentStyle}
            className="mt-7 text-center font-sans text-xl font-semibold leading-8 text-white/80"
          >
            Change your world,{'\n'}one conversation at a time.
          </Animated.Text>
        </View>

        <Animated.View style={contentStyle} className="w-full items-center gap-5">
          <Text className="text-gray-dark font-sans text-sm">
            {cards} cards · {languages} languages
          </Text>
          <Link href={`/play/${DEFAULT_DECK_SLUG}`} asChild>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Play"
              onPress={() => impact('light')}
              className="active:bg-yellow-500 w-full flex-row items-center justify-center rounded-full bg-yellow-400 py-4"
            >
              <Ionicons name="play" size={18} color={colors.darker} style={{marginRight: 8}} />
              <Text className="text-darker font-sans text-base font-bold">Play</Text>
            </PressableScale>
          </Link>
        </Animated.View>
      </SafeAreaView>
    </ScreenBackground>
  )
}
