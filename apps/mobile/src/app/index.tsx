import {Ionicons} from '@expo/vector-icons'
import {Image} from 'expo-image'
import {useRouter} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {useCallback, useEffect, useRef, useState} from 'react'
import type {HostInstance} from 'react-native'
import {Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native'
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {DEFAULT_DECK_SLUG, libraryDeck, resolveDeck} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {PressableScale} from '@/components/pressable-scale'
import {ScreenBackground} from '@/components/screen-background'
import {SecondaryButton} from '@/components/secondary-button'
import {SettingsModal} from '@/components/settings-modal'
import {useInternalMarker} from '@/hooks/use-internal-marker'
import {useThemeSetting} from '@/hooks/use-theme-setting'
import {getStoredGame} from '@/lib/game-store'
import {impact} from '@/lib/haptics'
import {useT} from '@/lib/i18n'
import {MOTION_DURATION, MOTION_EASING, motionDuration} from '@/lib/motion'
import type {HomeReturnEvent} from '@/lib/play-transition'
import {
  startPlayTransition,
  subscribePlayTransition,
  subscribeReturnedHome,
} from '@/lib/play-transition'
import {trpc} from '@/lib/trpc'

// We launch with the original WhoCards deck; its content ships in-app for offline play.
const deck = resolveDeck(libraryDeck)
const logo = require('../../assets/images/logo.png')

// Logo dimensions — kept in sync with the splash `imageWidth` (app.json) so the mark
// is the same size in the splash and on the landing, and the handoff is seamless.
const LOGO_WIDTH = 280
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 226) / 1200)
// Exact glyph gap ratios in logo.png (1200×226): WHO ends at 0.352, "?" is 0.380..0.461, CARDS starts at 0.485.
const WHO_CLIP_WIDTH = Math.round(LOGO_WIDTH * 0.365)
const CARDS_CLIP_LEFT = Math.round(LOGO_WIDTH * 0.473)
const CARDS_CLIP_WIDTH = LOGO_WIDTH - CARDS_CLIP_LEFT
// Entrance: the logo glides into place first (LOGO_MS), then the tagline/Play fade
// in (FADE_MS) so nothing crosses the moving logo. The background fades with the logo.
const LOGO_MS = 450
const FADE_MS = 350

// react-native-css's safe-area adapter provides the inset environment but
// re-exports the platform SafeAreaView, which does not consume className.
// Keep the layout-critical container styles explicit so the landing screen
// keeps its intended spacing on native as well as in Jest. Values mirror the
// former `flex-1 items-center justify-between px-8 pb-8 pt-16` classes
// (NativeWind resolves rem as 14px on native, so 8 → 28px and 16 → 56px).
export const libraryContainerStyle = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 28,
    paddingTop: 56,
  },
}).root

export default function LandingScreen() {
  const router = useRouter()
  const [serverMeta, setServerMeta] = useState<{cards: number; languages: number} | null>(null)
  const {width: winWidth, height: winHeight} = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  // the Theme Display setting (issue #163) — System-follow by default, with a
  // manual override. Every screen follows it now, including Play/Pick a Card's
  // chrome (issue #173) — only the Card itself stays dark in both themes.
  // `resolvedScheme` drives the raw-color props below (Ionicons, the Play
  // button's play-glyph fill, the local `<StatusBar>` override) that can't be
  // expressed as a `dark:` class.
  const {theme, resolvedScheme, select: selectTheme} = useThemeSetting()
  const isDark = resolvedScheme !== 'light'
  const t = useT()

  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  // 5B Home → Play parting exit state: null at rest.
  const [exitingTo, setExitingTo] = useState<GameId | null>(null)
  const exitProgress = useSharedValue(0)
  const exitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const launchingRef = useRef(false)
  const returningRef = useRef(false)

  const resetExitState = useCallback(() => {
    for (const id of exitTimersRef.current) clearTimeout(id)
    exitTimersRef.current = []
    launchingRef.current = false
    returningRef.current = false
    cancelAnimation(exitProgress)
    exitProgress.set(0)
    setExitingTo(null)
  }, [exitProgress])

  const handleReturnedHome = useCallback(
    (animated?: HomeReturnEvent) => {
      for (const id of exitTimersRef.current) clearTimeout(id)
      exitTimersRef.current = []
      launchingRef.current = false
      cancelAnimation(exitProgress)
      if (!animated || reduceMotion) {
        returningRef.current = false
        exitProgress.set(0)
        setExitingTo(null)
        return
      }
      // Symmetric reverse of 5B: WHO & CARDS close back around the arriving "?"
      // (or full logo lands from CardBack) while subtitle & buttons rise up cleanly.
      returningRef.current = true
      setExitingTo(animated.kind === 'deck' ? 'pick' : 'wh')
      exitProgress.set(1)
      exitProgress.set(withTiming(0, {duration: animated.duration, easing: MOTION_EASING.enter}))
      const safetyTimer = setTimeout(resetExitState, animated.duration + 160)
      exitTimersRef.current.push(safetyTimer)
    },
    [exitProgress, reduceMotion, resetExitState]
  )

  useEffect(() => {
    const unsubscribeReturn = subscribeReturnedHome(handleReturnedHome)
    // Atomic handoff: clear `exitingTo` in the EXACT same React commit that PlayTransitionOverlay
    // finishes and unmounts so intact logo.png swaps in with 0-frame gap and 0 double-draw.
    const unsubscribeOverlay = subscribePlayTransition((event) => {
      if (event === null && returningRef.current) {
        returningRef.current = false
        setExitingTo(null)
      }
    })
    return () => {
      unsubscribeReturn()
      unsubscribeOverlay()
      for (const id of exitTimersRef.current) clearTimeout(id)
    }
  }, [handleReturnedHome])

  // The hidden dev marker (issue #178) — a long-press on the wordmark below
  // toggles it. See use-internal-marker.ts.
  const {toggle: toggleInternalMarker} = useInternalMarker()

  // --- splash → landing handoff ---
  // The native splash centres the logo on screen. We start our (identical) logo at
  // that same centre, hide the splash, then animate it up into its landing position
  // (logoShift 0) while the tagline / Play block and the background texture fade in.
  const logoShift = useSharedValue(0) // vertical px offset from the final landing spot
  const contentOpacity = useSharedValue(0) // tagline + bottom block
  const bgOpacity = useSharedValue(0) // background texture
  const logoRef = useRef<HostInstance>(null)
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

  // Pins the logo where the splash drew it, measured on an untransformed box so the pin never measures itself.
  const logoBoxRef = useRef<HostInstance>(null)
  const pinLogo = useCallback(
    (then?: () => void) =>
      logoBoxRef.current?.measureInWindow((_x, y, _w, h) => {
        if (h) logoShift.set(winHeight / 2 - (y + h / 2))
        then?.()
      }),
    [winHeight, logoShift]
  )

  const reveal = useCallback(() => {
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

  const runEntrance = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    let revealed = false
    const revealOnce = () => {
      if (revealed) return
      revealed = true
      reveal()
    }
    // Re-pin from the final layout and hide the splash two frames later, once the UI thread has the pin.
    pinLogo(() => requestAnimationFrame(() => requestAnimationFrame(revealOnce)))
    // A measurement that never answers must not keep the splash up.
    setTimeout(revealOnce, 250)
  }, [pinLogo, reveal])

  const onLogoLayout = useCallback(() => {
    if (!startedRef.current) pinLogo()
  }, [pinLogo])

  // The splash hides once layout has settled and the logo has painted (else one frame shows no logo).
  const [logoShown, setLogoShown] = useState(false)
  const onLogoDisplay = useCallback(() => setLogoShown(true), [])
  useEffect(() => {
    const settle = setTimeout(() => {
      if (logoShown) runEntrance()
    }, 120)
    const fallback = setTimeout(runEntrance, 1000)
    return () => {
      clearTimeout(settle)
      clearTimeout(fallback)
    }
  }, [runEntrance, logoShown])

  const logoStyle = useAnimatedStyle(() => ({transform: [{translateY: logoShift.get()}]}))
  // Keep translateY always attached on the same animated style so Fabric never strands
  // the native view off-screen when exitProgress resets back to 0.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.get(),
    transform: [{translateY: interpolate(exitProgress.get(), [0, 1], [0, winHeight * 0.48])}],
  }))
  const whoPartStyle = useAnimatedStyle(() => ({
    transform: [{translateX: interpolate(exitProgress.get(), [0, 1], [0, -winWidth * 0.75])}],
  }))
  const cardsPartStyle = useAnimatedStyle(() => ({
    transform: [{translateX: interpolate(exitProgress.get(), [0, 1], [0, winWidth * 0.75])}],
  }))

  // 5B Home → Play: WHO parts left, CARDS parts right (or full WHO?CARDS flies to CardBack),
  // subtitle + buttons drop off the bottom while Play rises cleanly through the opening.
  const handlePlay = useCallback(() => {
    impact('light')
    const playHref = `/play/${DEFAULT_DECK_SLUG}` as const
    const dur = motionDuration(MOTION_DURATION.homeToPlay, reduceMotion)
    if (dur === 0) {
      router.push(playHref)
      return
    }
    if (launchingRef.current || exitingTo !== null) return
    launchingRef.current = true
    void getStoredGame().then((targetGame) => {
      const launch = (rect: {x: number; y: number; width: number; height: number}) => {
        setExitingTo(targetGame)
        cancelAnimation(exitProgress)
        exitProgress.set(0)
        startPlayTransition(targetGame, rect)
        exitProgress.set(
          withTiming(1, {duration: Math.round(dur * 0.48), easing: MOTION_EASING.exit})
        )
        const pushTimer = setTimeout(() => router.push(playHref), Math.round(dur * 0.44))
        const resetTimer = setTimeout(resetExitState, dur + 80)
        exitTimersRef.current.push(pushTimer, resetTimer)
      }
      if (logoRef.current?.measureInWindow) {
        logoRef.current.measureInWindow((x, y, width, height) => {
          launch(
            width && height
              ? {x, y, width, height}
              : {
                  x: (winWidth - LOGO_WIDTH) / 2,
                  y: winHeight * 0.36,
                  width: LOGO_WIDTH,
                  height: LOGO_HEIGHT,
                }
          )
        })
      } else {
        launch({
          x: (winWidth - LOGO_WIDTH) / 2,
          y: winHeight * 0.36,
          width: LOGO_WIDTH,
          height: LOGO_HEIGHT,
        })
      }
    })
  }, [exitingTo, exitProgress, reduceMotion, resetExitState, router, winHeight, winWidth])

  const cards = serverMeta?.cards ?? deck.questionIds.length
  const languages = serverMeta?.languages ?? deck.languages.length

  return (
    <ScreenBackground textureOpacity={bgOpacity}>
      {/* Library is the one screen that actually follows the Theme setting (issue
          #163), so — like every themed sheet (settings-modal.tsx, share-modal.tsx)
          — it needs its own local override: the root `_layout.tsx` default is a fixed
          `style="light"` (white icons) for the always-dark Play/Pick a Card screens,
          which would go invisible over the near-white `canvasLight` background. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView testID="library-safe-area" style={libraryContainerStyle}>
        <View className="flex-1 items-center justify-center">
          {/* Hidden dev marker (issue #178): a long-press on the wordmark toggles a
              persisted is_internal flag for this device — the manual counterpart to
              the automatic simulator/emulator flag, for the owner's 2 physical dev
              phones. `accessible={false}` keeps the Image's own accessibilityLabel
              ("WhoCards") as what VoiceOver/TalkBack lands on, rather than the
              Pressable swallowing it into an unlabeled button — this marker is
              deliberately not meant to be discoverable at all, screen reader or not. */}
          <Pressable onLongPress={toggleInternalMarker} accessible={false}>
            <View ref={logoBoxRef} onLayout={onLogoLayout}>
              <Animated.View ref={logoRef} style={logoStyle}>
                {/* Every logo image stays mounted and swaps by opacity: a fresh expo-image decodes a frame late. */}
                <Image
                  source={logo}
                  contentFit="contain"
                  onDisplay={onLogoDisplay}
                  accessibilityLabel="WhoCards"
                  // explicit width AND height — native sizes a required image to its
                  // intrinsic pixels otherwise (aspectRatio alone only works on web)
                  style={{
                    width: LOGO_WIDTH,
                    height: LOGO_HEIGHT,
                    opacity: exitingTo === null ? 1 : 0,
                  }}
                />
                {/* Classic: the clipped halves part around the flying "?"; Pick a Card: the overlay carries it all. */}
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    position: 'absolute',
                    width: LOGO_WIDTH,
                    height: LOGO_HEIGHT,
                    opacity: exitingTo === 'wh' ? 1 : 0,
                  }}
                >
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: WHO_CLIP_WIDTH,
                        height: LOGO_HEIGHT,
                        overflow: 'hidden',
                      },
                      whoPartStyle,
                    ]}
                  >
                    <Image
                      source={logo}
                      contentFit="contain"
                      style={{width: LOGO_WIDTH, height: LOGO_HEIGHT}}
                    />
                  </Animated.View>
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        left: CARDS_CLIP_LEFT,
                        top: 0,
                        width: CARDS_CLIP_WIDTH,
                        height: LOGO_HEIGHT,
                        overflow: 'hidden',
                      },
                      cardsPartStyle,
                    ]}
                  >
                    <Image
                      source={logo}
                      contentFit="contain"
                      style={{
                        width: LOGO_WIDTH,
                        height: LOGO_HEIGHT,
                        marginLeft: -CARDS_CLIP_LEFT,
                      }}
                    />
                  </Animated.View>
                </View>
              </Animated.View>
            </View>
          </Pressable>
          <Animated.Text
            style={contentStyle}
            // 26.25px line height, kept since the NativeWind 5 migration; rc reads leading-* as 0.25rem steps.
            className="text-darker/80 dark:text-white/80 mt-7 text-center font-sans text-xl font-semibold leading-7.5"
          >
            {t('home.tagline')}
          </Animated.Text>
        </View>

        <Animated.View style={contentStyle} className="w-full items-center gap-5">
          <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
            {t('home.count', {cards, languages})}
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('home.play')}
            onPress={handlePlay}
            className="active:bg-yellow-500 w-full flex-row items-center justify-center rounded-full bg-yellow-400 py-4"
          >
            <Ionicons name="play" size={18} color={colors.darker} style={{marginRight: 8}} />
            <Text className="text-darker font-sans text-base font-bold">{t('home.play')}</Text>
          </PressableScale>
          {/* the single Settings entry point (issue #176) — the app's first
              secondary-button, ported from the website's `.btn-secondary`
              (see secondary-button.tsx). Everything that used to be two
              outline chips here (Game, Theme) plus the play-screen language
              sheet (Language, Tabletop mode) now lives behind this one menu. */}
          <SecondaryButton
            label={t('home.settings')}
            icon={<Ionicons name="settings-outline" size={18} color={colors.white} />}
            onPress={() => setSettingsModalOpen(true)}
          />
        </Animated.View>

        <SettingsModal
          visible={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          deckSlug={deck.slug}
          languages={deck.languages}
          theme={theme}
          onSelectTheme={selectTheme}
        />
      </SafeAreaView>
    </ScreenBackground>
  )
}
