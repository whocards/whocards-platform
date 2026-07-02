import {Ionicons} from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import {useLocalSearchParams, useRouter} from 'expo-router'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {AppStateStatus, LayoutChangeEvent} from 'react-native'
import {AppState, Pressable, Text, useWindowDimensions, View} from 'react-native'
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
import type {GameId, NavAction, QuestionSet} from '@whocards/decks'
import {DEFAULT_GAME, getDeck, getInitialNav, navReducer} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'
import {EVENTS, GAMES, eventsFor, createViewTracker, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {LanguageModal} from '@/components/language-modal'
import {PickPlayer} from '@/components/pick-player'
import {PlayerBar} from '@/components/player-bar'
import {QuestionText} from '@/components/question-text'
import {ScreenBackground} from '@/components/screen-background'
import type {ShareFormat} from '@/components/share-modal'
import {ShareModal} from '@/components/share-modal'
import {usePlayerChrome} from '@/hooks/use-player-chrome'
import {useReviewPrompt} from '@/hooks/use-review-prompt'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {incrementCardCount, incrementSessionCount} from '@/lib/app-review'
import {getDeviceId} from '@/lib/device-id'
import {getStoredGame} from '@/lib/game-store'
import {impact, selection} from '@/lib/haptics'
import {
  getStoredLanguage,
  getStoredSecondaryLanguages,
  setStoredLanguage,
  setStoredSecondaryLanguages,
} from '@/lib/language-store'
import {parsePlayLink} from '@/lib/play-link'
import {buildShareCardUrl, buildShareUrl} from '@/lib/share-url'

const SWIPE_THRESHOLD = 60
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

export default function PlayScreen() {
  // `q` deep-links to a specific question (e.g. mobile://play/library?q=1): the engine
  // starts there in natural order instead of shuffling, so deep links and screenshot
  // captures are reproducible. Mirrors the web <Play> `?q=` behaviour (ADR-0003).
  const {deck: slug, q, lang} = useLocalSearchParams<{deck: string; q?: string; lang?: string}>()
  const deck = getDeck(slug)
  const deckSlug = deck?.slug

  // The chosen Game applies to organic opens only — a `?q=` deep link always opens
  // the classic player so shared links and screenshot captures stay reproducible.
  const isDeepLink = typeof q === 'string'
  const [game, setGame] = useState<GameId | null>(isDeepLink ? DEFAULT_GAME : null)
  // A warm deep link that arrives while the pick player is open (see the listener
  // below) — carries the linked question into the classic player it switches to.
  const [linkOverride, setLinkOverride] = useState<{q: string; lang?: string} | null>(null)
  useEffect(() => {
    if (isDeepLink) return
    void getStoredGame().then(setGame)
  }, [isDeepLink])

  // DeckPlayer owns warm-deep-link handling while IT is mounted; when the pick
  // player is open instead, catch the link here and switch to the classic player
  // at the linked question (deep links always open classic).
  useEffect(() => {
    if (game !== 'pick' || !deckSlug) return
    const sub = Linking.addEventListener('url', ({url}) => {
      const link = parsePlayLink(url)
      if (!link || link.deck !== deckSlug || !link.q) return
      setLinkOverride({q: link.q, lang: link.lang})
      setGame(DEFAULT_GAME)
    })
    return () => sub.remove()
  }, [game, deckSlug])

  if (!deck) {
    return (
      <ScreenBackground>
        <SafeAreaView className="flex-1 items-center justify-center">
          <Text className="font-sans text-white">Deck not found.</Text>
        </SafeAreaView>
      </ScreenBackground>
    )
  }

  // Hold the background (a single fast AsyncStorage read) until the stored Game
  // resolves, so the player never mounts one Game and flips to another.
  if (game === null) {
    return (
      <ScreenBackground>
        <View className="flex-1" />
      </ScreenBackground>
    )
  }

  if (game === 'pick') {
    return (
      <PickPlayer
        deckSlug={deck.slug}
        questionIds={deck.questionIds}
        questions={deck.questions}
        languages={deck.languages}
      />
    )
  }

  return (
    <DeckPlayer
      deckSlug={deck.slug}
      questionIds={deck.questionIds}
      questions={deck.questions}
      languages={deck.languages}
      startId={linkOverride?.q ?? (typeof q === 'string' ? q : undefined)}
      startLanguage={linkOverride?.lang ?? (typeof lang === 'string' ? lang : undefined)}
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
  // The REAL last-dispatched nav action, read by the nav-events effect below. The
  // committed transition alone can't tell a swipe from a deep-link 'reset' (both
  // change idx), and a reset must not be tracked as a fabricated next/previous —
  // so every dispatch goes through dispatchNav, which records the action first.
  const lastNavActionRef = useRef<NavAction | null>(null)
  const dispatchNav = useCallback((action: NavAction) => {
    lastNavActionRef.current = action
    dispatch(action)
  }, [])
  const defaultLanguage = languages[0]
  // A shared link's `?lang=` (if valid for this deck) is the explicit intent of the
  // person who shared it, so it seeds the initial language and overrides storage below.
  const linkLanguage =
    startLanguage && languages.includes(startLanguage) ? startLanguage : undefined
  const [language, setLanguage] = useState(linkLanguage ?? defaultLanguage)
  // secondary display languages rendered under the primary (a Display setting)
  const [secondary, setSecondary] = useState<string[]>([])
  // true once the AsyncStorage read has settled — gates the first card paint so
  // the player never shows a visible language flip on launch. The read is a single
  // fast local hit (~1-5 ms); holding the card behind it is the right trade-off
  // (ticket 0009 first-paint decision).
  const [languageReady, setLanguageReady] = useState(false)
  const [langModalOpen, setLangModalOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)

  // Seed language + secondaries from storage on mount. Only apply stored values
  // still present in this deck's languages list (guard against decks dropping one).
  useEffect(() => {
    const secondaries = getStoredSecondaryLanguages(deckSlug).then((stored) =>
      setSecondary(stored.filter((code) => languages.includes(code)))
    )
    // A shared link's language takes precedence — skip the stored value entirely.
    const primary = linkLanguage
      ? Promise.resolve(setLanguage(linkLanguage))
      : getStoredLanguage(deckSlug).then((stored) => {
          if (stored && languages.includes(stored)) {
            setLanguage(stored)
          }
        })
    void Promise.all([primary, secondaries]).then(() => setLanguageReady(true))
  }, [deckSlug, languages, linkLanguage])

  // A deep link that arrives while this deck is already open can't ride the route
  // params: expo-router de-dupes a same-route link (e.g. `play/library?q=5` while
  // already on `play/library`) and never updates `useLocalSearchParams`, so the card
  // wouldn't move. Listen for the raw incoming URL instead and re-seed the engine when
  // the link targets THIS deck. A link to a *different* deck changes the `[deck]`
  // segment and is handled by expo-router's own navigation (a fresh mount), so it's
  // ignored here. (`dispatchNav`/`setLanguage` are stable, so they stay out of the deps.)
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({url}) => {
      const link = parsePlayLink(url)
      if (!link || link.deck !== deckSlug) return
      if (link.lang && languages.includes(link.lang)) setLanguage(link.lang)
      if (link.q && questionIds.includes(link.q)) dispatchNav({type: 'reset', startId: link.q})
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug, languages, questionIds])

  const questionId = ids[idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''

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
    track({
      name: EVENTS.GAME_STARTED,
      props: {deck_id: deckSlug, game: GAMES.WH, language, secondary_languages: secondary},
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady])

  // Counts this session for review eligibility on its FIRST served card (below), so a
  // session that never showed a card isn't counted — matches the session-count doc.
  const sessionCountedRef = useRef(false)

  // In-app review — called after play (on exit or background), never mid-card.
  const maybeRequestReview = useReviewPrompt()

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
      // The real dispatched action — a deep-link 'reset' yields no nav events
      // (eventsFor returns []). Inference from the idx delta is only the fallback
      // for a transition with no recorded action (shouldn't happen in practice).
      const action =
        lastNavActionRef.current ??
        (idx > prev.idx ? ({type: 'next'} as const) : ({type: 'previous'} as const))
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

  // auto-hiding chrome — the card + gesture layer underneath spans the full
  // screen, so a tap anywhere (including the bands the bars occupy) reveals it
  const {
    chromeShown,
    revealChrome,
    topBarH,
    bottomBarH,
    onTopBarLayout,
    onBottomBarLayout,
    topChromeStyle,
    bottomChromeStyle,
  } = usePlayerChrome()

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
    dispatchNav({type: 'next'})
  }, [viewTracker, dispatchNav])

  const dispatchPrevious = useCallback(() => {
    navDir.current = -1
    selection()
    viewTracker.endView('previous')
    dispatchNav({type: 'previous'})
  }, [viewTracker, dispatchNav])

  const goNext = useCallback(() => {
    navDir.current = 1
    revealChrome()
    viewTracker.endView('advanced')
    dispatchNav({type: 'next'})
  }, [revealChrome, viewTracker, dispatchNav])

  // the reducer clamps `previous` at the first card, so no idx guard is needed here
  const goPrevious = useCallback(() => {
    navDir.current = -1
    revealChrome()
    viewTracker.endView('previous')
    dispatchNav({type: 'previous'})
  }, [revealChrome, viewTracker, dispatchNav])

  // leave the player — back to wherever we came from, falling back to the landing
  const handleExit = useCallback(() => {
    void maybeRequestReview()
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router, maybeRequestReview])

  const handleShare = useCallback(() => {
    if (!text) return
    setShareModalOpen(true)
  }, [text])

  const handleShareCompleted = useCallback(
    (format: ShareFormat) => {
      track({
        name: EVENTS.SHARE_COMPLETED,
        props: {deck_id: deckSlug, question_id: questionId, language, game: GAMES.WH, format},
      })
    },
    [deckSlug, questionId, language]
  )

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
                  <QuestionText
                    text={text}
                    language={language}
                    box={measured}
                    secondaries={secondary
                      .filter((code) => code !== language)
                      .map((code) => ({
                        language: code,
                        text: questions[questionId]?.[code] ?? '',
                      }))}
                  />
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
          secondary={secondary}
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
            // the new primary can't also be a secondary
            if (secondary.includes(next)) {
              const pruned = secondary.filter((code) => code !== next)
              setSecondary(pruned)
              void setStoredSecondaryLanguages(deckSlug, pruned)
            }
            setLangModalOpen(false)
            revealChrome()
          }}
          onSecondaryChange={(next) => {
            selection()
            track({
              name: EVENTS.SECONDARY_LANGUAGES_CHANGED,
              props: {deck_id: deckSlug, secondary: next},
            })
            setSecondary(next)
            void setStoredSecondaryLanguages(deckSlug, next)
          }}
          onClose={() => {
            setLangModalOpen(false)
            revealChrome()
          }}
        />

        <ShareModal
          visible={shareModalOpen}
          questionText={text}
          shareUrl={buildShareUrl(deckSlug, language, questionId)}
          storyImageUrl={buildShareCardUrl('story', language, questionId)}
          postImageUrl={buildShareCardUrl('post', language, questionId)}
          onShare={handleShareCompleted}
          onClose={() => setShareModalOpen(false)}
        />
      </View>
    </ScreenBackground>
  )
}
