import {Ionicons} from '@expo/vector-icons'
import {Image} from 'expo-image'
import {Link} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
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
import type {GameId} from '@whocards/decks'
import {DEFAULT_DECK_SLUG, DEFAULT_GAME, libraryDeck, resolveDeck} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {GameModal} from '@/components/game-modal'
import {PressableScale} from '@/components/pressable-scale'
import {ScreenBackground} from '@/components/screen-background'
import {ThemeModal} from '@/components/theme-modal'
import {useThemeSetting} from '@/hooks/use-theme-setting'
import {getStoredGame, setStoredGame} from '@/lib/game-store'
import {GAME_CATALOG} from '@/lib/games'
import {impact, selection} from '@/lib/haptics'
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

  // the chosen Game — persisted globally, applied by the player on Play
  const [game, setGame] = useState<GameId>(DEFAULT_GAME)
  const [gameModalOpen, setGameModalOpen] = useState(false)
  useEffect(() => {
    void getStoredGame().then(setGame)
  }, [])
  const gameTitle = GAME_CATALOG.find((entry) => entry.id === game)?.title ?? game

  // the Theme Display setting (issue #163) — System-follow by default, with a
  // manual override. Every screen follows it now, including Play/Pick a Card's
  // chrome (issue #173) — only the Card itself stays dark in both themes.
  // `resolvedScheme` drives the raw-color props below (Ionicons, the Play
  // button's play-glyph fill, the local `<StatusBar>` override) that can't be
  // expressed as a `dark:` class.
  const {theme, resolvedScheme, select: selectTheme} = useThemeSetting()
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const isDark = resolvedScheme !== 'light'
  const chromeColor = isDark ? colors.white : colors.darker

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
      {/* Library is the one screen that actually follows the Theme setting (issue
          #163), so — like each themed sheet (game-modal, language-modal, theme-modal)
          — it needs its own local override: the root `_layout.tsx` default is a fixed
          `style="light"` (white icons) for the always-dark Play/Pick a Card screens,
          which would go invisible over the near-white `canvasLight` background. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
            className="text-darker/80 dark:text-white/80 mt-7 text-center font-sans text-xl font-semibold leading-8"
          >
            Change your world,{'\n'}one conversation at a time.
          </Animated.Text>
        </View>

        <Animated.View style={contentStyle} className="w-full items-center gap-5">
          <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
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
          <View className="flex-row items-center gap-2.5">
            {/* quiet secondary controls (outline, never a second filled CTA — DESIGN.md) */}
            {/* label mirrors the visible text so tests and screen readers see the
                current Game (an icon-only 'choose game' label would hide it — the
                accessibility tree collapses a button's children behind its label) */}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Game: ${gameTitle}`}
              onPress={() => {
                impact('light')
                setGameModalOpen(true)
              }}
              className="border-darker/15 dark:border-white/25 active:bg-darker/5 dark:active:bg-white/10 flex-row items-center gap-1.5 rounded-full border px-4 py-2"
            >
              <Text className="text-darker/80 dark:text-white/80 font-sans text-sm">
                Game: {gameTitle}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={chromeColor} />
            </PressableScale>
            {/* the Theme Display setting (issue #163) — a per-Device presentation
                choice (CONTEXT.md), not a Game: never affects which Card is drawn
                or progress. Separate from the per-deck Language modal's "Display
                settings" (Tabletop mode, issue #148) — this one is global and
                reachable before any Deck is open, since it themes this very
                screen; named "Theme" to avoid colliding with that sheet's name. */}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Theme"
              onPress={() => {
                impact('light')
                setThemeModalOpen(true)
              }}
              className="border-darker/15 dark:border-white/25 active:bg-darker/5 dark:active:bg-white/10 h-9 w-9 items-center justify-center rounded-full border"
            >
              <Ionicons name="contrast-outline" size={16} color={chromeColor} />
            </PressableScale>
          </View>
        </Animated.View>

        <GameModal
          visible={gameModalOpen}
          current={game}
          onSelect={(next) => {
            selection()
            setGame(next)
            void setStoredGame(next)
            setGameModalOpen(false)
          }}
          onClose={() => setGameModalOpen(false)}
        />

        <ThemeModal
          visible={themeModalOpen}
          current={theme}
          onSelect={(next) => {
            selection()
            selectTheme(next)
            setThemeModalOpen(false)
          }}
          onClose={() => setThemeModalOpen(false)}
        />
      </SafeAreaView>
    </ScreenBackground>
  )
}
