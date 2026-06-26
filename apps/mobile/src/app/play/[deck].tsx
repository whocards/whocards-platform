import {Ionicons} from '@expo/vector-icons'
import * as Application from 'expo-application'
import {useLocalSearchParams, useRouter} from 'expo-router'
import * as StoreReview from 'expo-store-review'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {AppStateStatus, LayoutChangeEvent} from 'react-native'
import {AppState, Platform, Pressable, Share, Text, useWindowDimensions, View} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {QuestionSet} from '@whocards/decks'
import {getDeck, getDirection, getInitialNav, navReducer} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'
import {EVENTS, GAMES, eventsFor, createViewTracker, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {LanguageModal} from '@/components/language-modal'
import {PlayerBar} from '@/components/player-bar'
import {ScreenBackground} from '@/components/screen-background'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {
  getReviewState,
  incrementCardCount,
  incrementSessionCount,
  isReviewEligible,
  markReviewAttempted,
} from '@/lib/app-review'
import {getDeviceId} from '@/lib/device-id'
import {impact, selection} from '@/lib/haptics'
import {getStoredLanguage, setStoredLanguage} from '@/lib/language-store'
import {buildShareUrl} from '@/lib/share-url'

const SWIPE_THRESHOLD = 60
const CHROME_HIDE_MS = 3000
// How far off-screen the card travels when a swipe commits (points)
const SWIPE_OFF_SCREEN = 400
// Rubber-band resistance factor when swiping at a boundary (0–1, lower = more resistance)
const RUBBER_BAND = 0.3

// Card-enter animation durations (ms) and travel offsets (points).
// Subsequent swipes use CARD_ENTER_MS / CARD_ENTER_TRAVEL — snappy and unchanged.
// The very first entrance (app open) uses a slower, more deliberate timing on both
// platforms so it reads as a deal rather than a pop.
const CARD_ENTER_MS = 260
const INITIAL_CARD_ENTER_MS = 900
const CARD_ENTER_TRAVEL = 28
// Larger travel on the first entrance so the slower 900 ms timing reads as a real
// slide rather than a long fade-in.
const INITIAL_CARD_ENTER_TRAVEL = 56

// Per-script question face. golos-text (the brand body face) covers Latin + Cyrillic;
// Hebrew gets its bundled Noto face; CJK (zh/jp) falls back to the system font — full
// glyph coverage on device, and the Noto CJK faces are too heavy to bundle (see
// docs/tickets/0001-mobile-cjk-hebrew-question-fonts.md).
const SYSTEM_FONT_LANGUAGES = new Set(['zh', 'jp'])
const SCRIPT_FONTS: Record<string, string> = {he: 'noto-sans-hebrew'}

/** The font family for a question in `language`, or `undefined` for the system font. */
const questionFontFamily = (language: string): string | undefined => {
  if (language in SCRIPT_FONTS) return SCRIPT_FONTS[language]
  return SYSTEM_FONT_LANGUAGES.has(language) ? undefined : 'golos-text'
}

// --- dynamic question sizing: grow the text to fill its box, recomputed on rotation ---
const LINE_HEIGHT_RATIO = 1.15
// average glyph advance / line height as fractions of the font size (semibold sans)
const CHAR_WIDTH_RATIO = 0.54
// fraction of the box the text aims to cover — kept well under 1 so ragged wrapping
// and real-device font metrics (taller than this estimate) still leave breathing room
const FILL = 0.5
const MIN_FONT = 22
const MAX_FONT = 96

/**
 * Largest font that lets `text` fill — without overflowing — a `width`×`height` box.
 * Derived from area (chars × glyph area ≈ filled area, so font ∝ √(area / chars)), then
 * capped so the longest single word still fits on one line. Orientation falls out for
 * free: rotating swaps width/height, the box changes, and the size is recomputed.
 */
const fitFontSize = (text: string, width: number, height: number) => {
  if (width <= 0 || height <= 0) return MIN_FONT
  const trimmed = text.trim()
  const chars = Math.max(trimmed.length, 1)
  const raw = Math.sqrt((FILL * width * height) / (chars * CHAR_WIDTH_RATIO * LINE_HEIGHT_RATIO))
  // cap so the longest word fills ~90% of the width — a margin on the widest lines too
  const longestWord = trimmed.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 1)
  const widthCap = (width * 0.9) / (longestWord * CHAR_WIDTH_RATIO)
  return Math.round(Math.max(MIN_FONT, Math.min(MAX_FONT, raw, widthCap)))
}

export default function PlayScreen() {
  // `q` deep-links to a specific question (e.g. mobile://play/library?q=1): the engine
  // starts there in natural order instead of shuffling, so deep links and screenshot
  // captures are reproducible. Mirrors the web <Play> `?q=` behaviour (ADR-0003).
  const {deck: slug, q, lang} = useLocalSearchParams<{deck: string; q?: string; lang?: string}>()
  const deck = getDeck(slug)

  if (!deck) {
    return (
      <ScreenBackground>
        <SafeAreaView className="flex-1 items-center justify-center">
          <Text className="font-sans text-white">Deck not found.</Text>
        </SafeAreaView>
      </ScreenBackground>
    )
  }

  return (
    <DeckPlayer
      deckSlug={deck.slug}
      questionIds={deck.questionIds}
      questions={deck.questions}
      languages={deck.languages}
      startId={typeof q === 'string' ? q : undefined}
      startLanguage={typeof lang === 'string' ? lang : undefined}
    />
  )
}

type DeckPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
  startId?: string
  /** Language from a shared deep-link (`?lang=`); wins over the stored preference. */
  startLanguage?: string
}

const DeckPlayer = ({
  deckSlug,
  questionIds,
  questions,
  languages,
  startId,
  startLanguage,
}: DeckPlayerProps) => {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  // the shared headless engine — identical behaviour to the web <Play> (ADR-0003)
  const reducer = useMemo(() => navReducer(questionIds), [questionIds])
  const [{ids, idx}, dispatch] = useReducer(reducer, undefined, () =>
    getInitialNav(questionIds, startId)
  )
  const defaultLanguage = languages[0]
  // A shared link's `?lang=` (if valid for this deck) is the explicit intent of the
  // person who shared it, so it seeds the initial language and overrides storage below.
  const linkLanguage =
    startLanguage && languages.includes(startLanguage) ? startLanguage : undefined
  const [language, setLanguage] = useState(linkLanguage ?? defaultLanguage)
  // true once the AsyncStorage read has settled — gates the first card paint so
  // the player never shows a visible language flip on launch. The read is a single
  // fast local hit (~1-5 ms); holding the card behind it is the right trade-off
  // (ticket 0009 first-paint decision).
  const [languageReady, setLanguageReady] = useState(false)
  const [langModalOpen, setLangModalOpen] = useState(false)

  // Seed language from storage on mount. Only apply a stored value if it is still
  // present in this deck's languages list (guard against decks dropping a language).
  useEffect(() => {
    // A shared link's language takes precedence — skip the stored value entirely.
    if (linkLanguage) {
      setLanguage(linkLanguage)
      setLanguageReady(true)
      return
    }
    void getStoredLanguage(deckSlug).then((stored) => {
      if (stored && languages.includes(stored)) {
        setLanguage(stored)
      }
      setLanguageReady(true)
    })
  }, [deckSlug, languages, linkLanguage])

  const questionId = ids[idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''
  const direction = getDirection(language)
  // brand/script face where one exists; system font (with a weight) otherwise
  const questionFont = questionFontFamily(language)

  // --- observability: dwell tracker (stable for the component lifetime) ---
  const viewTracker = useMemo(() => createViewTracker(trackEvent), [])

  // previous committed nav state — nav events read the REAL post-dispatch ids (no
  // pre-dispatch approximation; correct question_next/deck_cycled at the cycle
  // boundary, transition logic stays in @whocards/observability/events).
  const prevNavRef = useRef<{ids: typeof ids; idx: number} | null>(null)

  // --- observability: deck_opened on mount; game_started once the stored language
  // has resolved (so its `language` is the real selection, not the default) ---
  useEffect(() => {
    track({
      name: EVENTS.DECK_OPENED,
      props: {deck_id: deckSlug, source: startId ? 'deep_link' : 'browse'},
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug])

  const gameStartedRef = useRef(false)
  useEffect(() => {
    if (!languageReady || gameStartedRef.current) return
    gameStartedRef.current = true
    track({name: EVENTS.GAME_STARTED, props: {deck_id: deckSlug, game: GAMES.WH, language}})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady])

  // Counts this session for review eligibility on its FIRST served card (below), so a
  // session that never showed a card isn't counted — matches the session-count doc.
  const sessionCountedRef = useRef(false)

  // --- In-app review: check eligibility and fire the native OS prompt ---
  // Called after play (on exit or background), never mid-card or on launch.
  // Fails silently; emits app_review_eligible and app_review_requested via track().
  // An in-flight ref dedupes concurrent calls (AppState background + exit can both
  // fire) so two callers can't pass the eligibility check before the first persists.
  const reviewRequestInFlightRef = useRef(false)
  const maybeRequestReview = useCallback(async () => {
    if (reviewRequestInFlightRef.current) return
    reviewRequestInFlightRef.current = true
    try {
      const appVersion = Application.nativeApplicationVersion ?? '0'
      const state = await getReviewState()
      if (!isReviewEligible(state, appVersion)) return

      track({
        name: EVENTS.APP_REVIEW_ELIGIBLE,
        props: {
          app_version: appVersion,
          card_count: state.cardCount,
          session_count: state.sessionCount,
        },
      })

      const available = await StoreReview.isAvailableAsync()
      if (!available) return
      const hasAction = await StoreReview.hasAction()
      if (!hasAction) return

      // Persist before calling so a background/crash after this point doesn't
      // allow a second attempt on the same version.
      await markReviewAttempted(appVersion)

      track({
        name: EVENTS.APP_REVIEW_REQUESTED,
        props: {app_version: appVersion, platform: Platform.OS},
      })

      await StoreReview.requestReview()
    } catch {
      // Fail silently — store review is best-effort.
    } finally {
      reviewRequestInFlightRef.current = false
    }
  }, [])

  // --- Answer record: every serve enqueues an Answer; the queue sends it (or
  // retries offline). Recording is wired here, not in the engine, so the shared
  // headless engine stays pure (ADR-0003). ---

  // flush leftovers on app-start and whenever the app returns to the foreground,
  // so a queue that built up offline drains as soon as the network is back
  useEffect(() => {
    void flush(send)
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void flush(send)
      if (state === 'background' || state === 'inactive') {
        viewTracker.endView('backgrounded')
        // After a play session ends (app backgrounded), check for review eligibility.
        void maybeRequestReview()
      }
    })
    return () => sub.remove()
  }, [viewTracker, maybeRequestReview])

  // one Answer per Question served (keyed on questionId, so re-renders don't
  // double-record); also a flush trigger via enqueue's opportunistic send.
  // TODO(answered=served): `language` in the deps re-records when the language is
  // switched on the same card (an over-count vs "answered = served"); revisit when
  // the "answered" definition gains a dwell timer.
  // Card count for in-app review eligibility increments on the same questionId key
  // (same over-count caveat as above).
  useEffect(() => {
    if (!questionId) return
    let cancelled = false
    void getDeviceId().then((deviceId) => {
      if (cancelled) return
      void enqueue({deviceId, deckSlug, questionId, language}, send)
    })
    void incrementCardCount()
    // First served card of this session → count the session for review eligibility.
    if (!sessionCountedRef.current) {
      sessionCountedRef.current = true
      void incrementSessionCount()
    }
    return () => {
      cancelled = true
    }
  }, [questionId, deckSlug, language])

  // --- observability: nav events from the real committed transition (prev → current) ---
  useEffect(() => {
    const prev = prevNavRef.current
    if (prev && prev.idx !== idx) {
      const action = idx > prev.idx ? ({type: 'next'} as const) : ({type: 'previous'} as const)
      for (const event of eventsFor(
        action,
        prev,
        {ids, idx},
        {
          deck_id: deckSlug,
          language,
          game: GAMES.WH,
        }
      )) {
        track(event)
      }
    }
    prevNavRef.current = {ids, idx}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ids])

  // --- observability: track question shown + start dwell timer ---
  useEffect(() => {
    if (!questionId) return
    track({
      name: EVENTS.QUESTION_SHOWN,
      props: {deck_id: deckSlug, question_id: questionId, language, source: 'nav'},
    })
    viewTracker.startView({deck_id: deckSlug, question_id: questionId, language})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId])

  // --- measure the card's box so the question can grow to fill it (landscape included) ---
  const {width: winWidth, height: winHeight} = useWindowDimensions()
  const [box, setBox] = useState<{width: number; height: number} | null>(null)
  const onBoxLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout
    setBox((prev) => (prev?.width === width && prev?.height === height ? prev : {width, height}))
  }, [])
  // window-derived fallback for the first paint, before onLayout reports the real box
  const measured = box ?? {width: winWidth - 64, height: winHeight - 220}
  const fontSize = useMemo(
    () => fitFontSize(text, measured.width, measured.height),
    [text, measured.width, measured.height]
  )

  // --- auto-hiding chrome: a single 0→1 progress slides the bars in and out —
  // the top bar up off the top edge, the bottom bar down off the bottom edge
  // (a slide, not a fade). The card + gesture layer underneath spans the full
  // screen, so a tap anywhere — including the bands the bars occupy — reveals
  // the chrome again. ---
  const chromeProgress = useSharedValue(1)
  const [chromeShown, setChromeShown] = useState(true)
  // Measured bar heights drive both the off-screen slide distance and the card's
  // padding, so the question never sits under a bar even though the gesture layer
  // runs full-bleed behind them.
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

  // --- Reanimated card enter/exit: translateX shared value ---
  // Positive = entering from the right (going "next"), negative = entering from left (going "prev")
  // During a swipe: translateX tracks the finger directly.
  const translateX = useSharedValue(0)
  // navDir: +1 = next (slide left), -1 = previous (slide right)
  const navDir = useRef(1)
  // Whether we're at the first card — used in gesture rubber-band check
  const isAtFirst = idx === 0
  // Flips to false after the very first entrance so only the open sequence gets
  // the slower, deliberate timing (subsequent swipes stay at CARD_ENTER_MS).
  const isFirstEnter = useRef(true)

  // card-enter animation: when questionId changes, the new card flies in from
  // the appropriate edge. navDir is set by goNext/goPrevious before dispatch.
  // The first entrance uses a longer duration on Android so it reads as a
  // deliberate "deal the card" rather than an abrupt pop.
  useEffect(() => {
    const first = isFirstEnter.current
    if (first) isFirstEnter.current = false
    const travel = reduceMotion ? 0 : first ? INITIAL_CARD_ENTER_TRAVEL : CARD_ENTER_TRAVEL
    const duration = reduceMotion ? 0 : first ? INITIAL_CARD_ENTER_MS : CARD_ENTER_MS
    translateX.set(navDir.current * travel)
    translateX.set(withTiming(0, {duration}))
  }, [questionId, translateX, reduceMotion])

  const cardStyle = useAnimatedStyle(() => {
    // opacity fades slightly as the card is dragged off screen
    const opacity = interpolate(
      translateX.get(),
      [-SWIPE_OFF_SCREEN, 0, SWIPE_OFF_SCREEN],
      [0, 1, 0],
      'clamp'
    )
    return {
      opacity,
      transform: [{translateX: translateX.get()}],
    }
  })

  // JS-thread callbacks for dispatching navigation after a committed swipe.
  // navDir is set here so the card-enter effect knows which edge to enter from.
  const dispatchNext = useCallback(() => {
    navDir.current = 1
    selection()
    viewTracker.endView('advanced')
    dispatch({type: 'next'})
  }, [viewTracker])

  const dispatchPrevious = useCallback(() => {
    navDir.current = -1
    selection()
    viewTracker.endView('previous')
    dispatch({type: 'previous'})
  }, [viewTracker])

  const goNext = useCallback(() => {
    navDir.current = 1
    revealChrome()
    viewTracker.endView('advanced')
    dispatch({type: 'next'})
  }, [revealChrome, viewTracker])

  // the reducer clamps `previous` at the first card, so no idx guard is needed here
  const goPrevious = useCallback(() => {
    navDir.current = -1
    revealChrome()
    viewTracker.endView('previous')
    dispatch({type: 'previous'})
  }, [revealChrome, viewTracker])

  // leave the player — back to wherever we came from, falling back to the landing
  const handleExit = useCallback(() => {
    void maybeRequestReview()
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router, maybeRequestReview])

  const handleShare = useCallback(() => {
    if (!text) return
    const url = buildShareUrl(deckSlug, language, questionId)
    // `url` is read by iOS share sheet; `message` carries the link on Android (which
    // ignores the `url` field) and provides a fallback for any platform.
    void Share.share({message: `${text}\n\n${url}`, url})
  }, [text, deckSlug, language, questionId])

  const openLanguage = useCallback(() => setLangModalOpen(true), [])

  // --- UI-thread gesture: pan tracks finger; tap reveals chrome ---
  // isAtFirst ref is read on the UI thread via a shared value to avoid closure stale issues
  const isAtFirstSV = useSharedValue(isAtFirst)
  useEffect(() => {
    isAtFirstSV.set(isAtFirst)
  }, [isAtFirst, isAtFirstSV])

  // reduceMotion ref for worklet access
  const reduceMotionSV = useSharedValue(reduceMotion)
  useEffect(() => {
    reduceMotionSV.set(reduceMotion)
  }, [reduceMotion, reduceMotionSV])

  // stable JS callbacks for worklet → JS bridge
  const revealChromeStable = useCallback(() => revealChrome(), [revealChrome])
  const impactMediumOnJS = useCallback(() => impact('medium'), [])

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onBegin(() => {
        'worklet'
        runOnJS(revealChromeStable)()
      })
      .onUpdate((event) => {
        'worklet'
        const tx = event.translationX
        // Rubber-band at the left boundary: if there's nowhere to go "previous",
        // resist the right-swipe so the card doesn't slide freely
        if (tx > 0 && isAtFirstSV.get()) {
          translateX.set(tx * RUBBER_BAND)
        } else {
          translateX.set(tx)
        }
      })
      .onEnd((event) => {
        'worklet'
        const tx = event.translationX
        const vx = event.velocityX
        const travel = reduceMotionSV.get() ? 0 : SWIPE_OFF_SCREEN

        // commit next: swipe left past threshold or fast leftward fling
        if (tx <= -SWIPE_THRESHOLD || vx < -500) {
          runOnJS(impactMediumOnJS)()
          translateX.set(
            withTiming(-travel, {duration: reduceMotionSV.get() ? 0 : 260}, () => {
              'worklet'
              runOnJS(dispatchNext)()
            })
          )
          return
        }
        // commit previous: swipe right past threshold or fast rightward fling
        // (but not if rubber-banded at the start)
        if ((tx >= SWIPE_THRESHOLD || vx > 500) && !isAtFirstSV.get()) {
          runOnJS(impactMediumOnJS)()
          translateX.set(
            withTiming(travel, {duration: reduceMotionSV.get() ? 0 : 260}, () => {
              'worklet'
              runOnJS(dispatchPrevious)()
            })
          )
          return
        }
        // spring back to rest
        translateX.set(withSpring(0, {damping: 20, stiffness: 300}))
      })

    const tap = Gesture.Tap().onStart(() => {
      'worklet'
      runOnJS(revealChromeStable)()
    })

    return Gesture.Race(tap, pan)
  }, [
    revealChromeStable,
    dispatchNext,
    dispatchPrevious,
    impactMediumOnJS,
    translateX,
    isAtFirstSV,
    reduceMotionSV,
  ])

  return (
    <ScreenBackground>
      <View className="flex-1">
        {/* full-screen card + gesture layer: tap anywhere reveals the chrome, swipe
            navigates. The bars are overlays on top, so the whole screen — including
            the bands they occupy — stays a live tap/swipe target even while hidden.
            Padded by the measured bar heights so the question sits between the bars.
            Hidden until languageReady so the card never flips language mid-paint
            (ticket 0009 first-paint decision: gate on the single AsyncStorage read). */}
        <GestureDetector gesture={gesture}>
          <View className="flex-1 px-8" style={{paddingTop: topBarH, paddingBottom: bottomBarH}}>
            <View className="flex-1 justify-center" onLayout={onBoxLayout}>
              {languageReady ? (
                <Animated.View style={cardStyle}>
                  <Text
                    className="text-white"
                    style={{
                      fontSize,
                      lineHeight: fontSize * LINE_HEIGHT_RATIO,
                      writingDirection: direction,
                      // writingDirection sets the bidi base direction but not paragraph
                      // alignment in RN — RTL (Hebrew) needs textAlign to right-align
                      textAlign: direction === 'rtl' ? 'right' : 'left',
                      ...(questionFont ? {fontFamily: questionFont} : {fontWeight: '600'}),
                    }}
                  >
                    {text}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
          </View>
        </GestureDetector>

        {/* close — top-right chip; slides up out of view when the chrome hides.
            box-none lets taps on the empty top band fall through to reveal the chrome. */}
        <Animated.View
          pointerEvents={chromeShown ? 'box-none' : 'none'}
          onLayout={onTopBarLayout}
          className="absolute inset-x-0 top-0"
          style={topChromeStyle}
        >
          <SafeAreaView edges={['top', 'left', 'right']}>
            <View className="items-end px-4 pt-2">
              <Pressable
                onPress={handleExit}
                hitSlop={8}
                accessibilityLabel="exit deck"
                className="h-10 w-10 items-center justify-center rounded-full bg-darker/80 active:bg-darker"
              >
                <Ionicons name="close" size={22} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>

        {/* bottom action bar — slides down out of view when the chrome hides */}
        <Animated.View
          pointerEvents={chromeShown ? 'box-none' : 'none'}
          onLayout={onBottomBarLayout}
          className="absolute inset-x-0 bottom-0"
          style={bottomChromeStyle}
        >
          <PlayerBar
            showLanguage={languages.length > 1}
            onPrevious={goPrevious}
            onNext={goNext}
            onShare={handleShare}
            onLanguage={openLanguage}
          />
        </Animated.View>

        <LanguageModal
          visible={langModalOpen}
          languages={languages}
          current={language}
          onSelect={(next) => {
            selection()
            if (next !== language) {
              track({
                name: EVENTS.LANGUAGE_CHANGED,
                props: {deck_id: deckSlug, from: language, to: next},
              })
            }
            setLanguage(next)
            void setStoredLanguage(deckSlug, next)
            setLangModalOpen(false)
            revealChrome()
          }}
          onClose={() => {
            setLangModalOpen(false)
            revealChrome()
          }}
        />
      </View>
    </ScreenBackground>
  )
}
