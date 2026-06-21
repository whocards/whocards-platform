import {Ionicons} from '@expo/vector-icons'
import {useLocalSearchParams, useRouter} from 'expo-router'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {AppStateStatus, LayoutChangeEvent} from 'react-native'
import {AppState, Pressable, Share, Text, useWindowDimensions, View} from 'react-native'
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
import {colors} from '@whocards/tokens'

import {LanguageModal} from '@/components/language-modal'
import {PlayerBar} from '@/components/player-bar'
import {ScreenBackground} from '@/components/screen-background'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {getDeviceId} from '@/lib/device-id'
import {impact, selection} from '@/lib/haptics'
import {getStoredLanguage, setStoredLanguage} from '@/lib/language-store'

const SWIPE_THRESHOLD = 60
const CHROME_HIDE_MS = 3000
// How far off-screen the card travels when a swipe commits (points)
const SWIPE_OFF_SCREEN = 400
// Rubber-band resistance factor when swiping at a boundary (0–1, lower = more resistance)
const RUBBER_BAND = 0.3

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
  const {deck: slug} = useLocalSearchParams<{deck: string}>()
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
    />
  )
}

type DeckPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
}

const DeckPlayer = ({deckSlug, questionIds, questions, languages}: DeckPlayerProps) => {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  // the shared headless engine — identical behaviour to the web <Play> (ADR-0003)
  const reducer = useMemo(() => navReducer(questionIds), [questionIds])
  const [{ids, idx}, dispatch] = useReducer(reducer, undefined, () => getInitialNav(questionIds))
  const defaultLanguage = languages[0]
  const [language, setLanguage] = useState(defaultLanguage)
  // true once the AsyncStorage read has settled — gates the first card paint so
  // the player never shows a visible language flip on launch. The read is a single
  // fast local hit (~1-5 ms); holding the card behind it is the right trade-off
  // (ticket 0009 first-paint decision).
  const [languageReady, setLanguageReady] = useState(false)
  const [langModalOpen, setLangModalOpen] = useState(false)

  // Seed language from storage on mount. Only apply a stored value if it is still
  // present in this deck's languages list (guard against decks dropping a language).
  useEffect(() => {
    void getStoredLanguage(deckSlug).then((stored) => {
      if (stored && languages.includes(stored)) {
        setLanguage(stored)
      }
      setLanguageReady(true)
    })
  }, [deckSlug, languages])

  const questionId = ids[idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''
  const direction = getDirection(language)
  // brand/script face where one exists; system font (with a weight) otherwise
  const questionFont = questionFontFamily(language)

  // --- Answer record: every serve enqueues an Answer; the queue sends it (or
  // retries offline). Recording is wired here, not in the engine, so the shared
  // headless engine stays pure (ADR-0003). ---

  // flush leftovers on app-start and whenever the app returns to the foreground,
  // so a queue that built up offline drains as soon as the network is back
  useEffect(() => {
    void flush(send)
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void flush(send)
    })
    return () => sub.remove()
  }, [])

  // one Answer per Question served (keyed on questionId, so re-renders don't
  // double-record); also a flush trigger via enqueue's opportunistic send.
  // TODO(answered=served): `language` in the deps re-records when the language is
  // switched on the same card (an over-count vs "answered = served"); revisit when
  // the "answered" definition gains a dwell timer.
  useEffect(() => {
    if (!questionId) return
    let cancelled = false
    void getDeviceId().then((deviceId) => {
      if (cancelled) return
      void enqueue({deviceId, deckSlug, questionId, language}, send)
    })
    return () => {
      cancelled = true
    }
  }, [questionId, deckSlug, language])

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

  // --- auto-hiding chrome: Reanimated shared value drives opacity ---
  const chromeOpacity = useSharedValue(1)
  const [chromeShown, setChromeShown] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fadeChrome = useCallback(
    (to: number) => {
      setChromeShown(to === 1)
      chromeOpacity.set(withTiming(to, {duration: reduceMotion ? 0 : 300}))
    },
    [chromeOpacity, reduceMotion]
  )

  const revealChrome = useCallback(() => {
    fadeChrome(1)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => fadeChrome(0), CHROME_HIDE_MS)
  }, [fadeChrome])

  useEffect(() => {
    revealChrome()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealChrome])

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.get(),
  }))

  // --- Reanimated card enter/exit: translateX shared value ---
  // Positive = entering from the right (going "next"), negative = entering from left (going "prev")
  // During a swipe: translateX tracks the finger directly.
  const translateX = useSharedValue(0)
  // navDir: +1 = next (slide left), -1 = previous (slide right)
  const navDir = useRef(1)
  // Whether we're at the first card — used in gesture rubber-band check
  const isAtFirst = idx === 0

  // card-enter animation: when questionId changes, the new card flies in from
  // the appropriate edge. navDir is set by goNext/goPrevious before dispatch.
  useEffect(() => {
    const travel = reduceMotion ? 0 : 28
    translateX.set(navDir.current * travel)
    translateX.set(withTiming(0, {duration: reduceMotion ? 0 : 260}))
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
    dispatch({type: 'next'})
  }, [])

  const dispatchPrevious = useCallback(() => {
    navDir.current = -1
    selection()
    dispatch({type: 'previous'})
  }, [])

  const goNext = useCallback(() => {
    navDir.current = 1
    revealChrome()
    dispatch({type: 'next'})
  }, [revealChrome])

  // the reducer clamps `previous` at the first card, so no idx guard is needed here
  const goPrevious = useCallback(() => {
    navDir.current = -1
    revealChrome()
    dispatch({type: 'previous'})
  }, [revealChrome])

  // leave the player — back to wherever we came from, falling back to the landing
  const handleExit = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])

  const handleShare = useCallback(() => {
    if (text) void Share.share({message: `${text}\n\n— WhoCards`})
  }, [text])

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
        {/* close — top-right, on a chip so it reads over any content (auto-hides) */}
        <Animated.View style={[{pointerEvents: chromeShown ? 'auto' : 'none'}, chromeStyle]}>
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

        {/* the question — tap reveals the chrome, swipe navigates.
            Hidden until languageReady so the card never flips language mid-paint
            (ticket 0009 first-paint decision: gate on the single AsyncStorage read). */}
        <GestureDetector gesture={gesture}>
          <View className="flex-1 px-8 py-2">
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

        {/* bottom action bar — shares the chrome's fade */}
        <Animated.View style={[{pointerEvents: chromeShown ? 'auto' : 'none'}, chromeStyle]}>
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
