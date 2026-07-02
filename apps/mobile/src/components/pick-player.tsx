import {Ionicons} from '@expo/vector-icons'
import {useRouter} from 'expo-router'
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
import {getInitialPick, pickReducer} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'
import {EVENTS, GAMES, eventsFor, createViewTracker, track} from '@whocards/observability/events'
import {colors} from '@whocards/tokens'

import {LanguageModal} from '@/components/language-modal'
import {PlayerBar} from '@/components/player-bar'
import {PressableScale} from '@/components/pressable-scale'
import {QuestionText} from '@/components/question-text'
import {ScreenBackground} from '@/components/screen-background'
import {usePlayerChrome} from '@/hooks/use-player-chrome'
import {useReviewPrompt} from '@/hooks/use-review-prompt'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {incrementCardCount, incrementSessionCount} from '@/lib/app-review'
import {getDeviceId} from '@/lib/device-id'
import {impact, selection} from '@/lib/haptics'
import {
  getStoredLanguage,
  getStoredSecondaryLanguages,
  setStoredLanguage,
  setStoredSecondaryLanguages,
} from '@/lib/language-store'
import {buildShareUrl} from '@/lib/share-url'

const SWIPE_THRESHOLD = 60
// How far off-screen the card travels when a swipe commits (points)
const SWIPE_OFF_SCREEN = 400
// Rubber-band resistance factor when swiping at a boundary (0–1, lower = more resistance)
const RUBBER_BAND = 0.3
// Full card flip (deal → reveal) duration; DESIGN.md's 200–300 ms band applies to
// interaction transitions — the deal is the one composed "moment of theatre" per card.
const FLIP_MS = 450

type PickPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
}

/**
 * The Pick a Card Game (CONTEXT.md): the player deals each Card deliberately —
 * a big "Pick a card" action flips the next question face-up, and moving on
 * returns to the pick screen rather than straight to another Card. Draw policy
 * is the same non-repeating shuffle as Classic (the engine's pickReducer
 * composes navReducer); only the reveal ritual differs.
 */
export const PickPlayer = ({deckSlug, questionIds, questions, languages}: PickPlayerProps) => {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  const reducer = useMemo(() => pickReducer(questionIds), [questionIds])
  const [{nav, phase, dealt}, dispatch] = useReducer(reducer, questionIds, getInitialPick)
  const onCard = phase === 'card'

  const defaultLanguage = languages[0]
  const [language, setLanguage] = useState(defaultLanguage)
  // secondary display languages rendered under the primary (a Display setting)
  const [secondary, setSecondary] = useState<string[]>([])
  // gate the first reveal on the stored-language read, mirroring DeckPlayer
  const [languageReady, setLanguageReady] = useState(false)
  const [langModalOpen, setLangModalOpen] = useState(false)

  useEffect(() => {
    void Promise.all([
      getStoredLanguage(deckSlug).then((stored) => {
        if (stored && languages.includes(stored)) {
          setLanguage(stored)
        }
      }),
      getStoredSecondaryLanguages(deckSlug).then((stored) =>
        setSecondary(stored.filter((code) => languages.includes(code)))
      ),
    ]).then(() => setLanguageReady(true))
  }, [deckSlug, languages])

  const questionId = nav.ids[nav.idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''

  // --- observability ---
  const viewTracker = useMemo(() => createViewTracker(trackEvent), [])
  const prevNavRef = useRef<{ids: string[]; idx: number} | null>(null)

  useEffect(() => {
    track({name: EVENTS.DECK_OPENED, props: {deck_id: deckSlug, source: 'browse'}})
  }, [deckSlug])

  const gameStartedRef = useRef(false)
  useEffect(() => {
    if (!languageReady || gameStartedRef.current) return
    gameStartedRef.current = true
    track({
      name: EVENTS.GAME_STARTED,
      props: {deck_id: deckSlug, game: GAMES.PICK, language, secondary_languages: secondary},
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady])

  // nav events from the real committed transition (prev → current), same as DeckPlayer
  useEffect(() => {
    const prev = prevNavRef.current
    if (prev && prev.idx !== nav.idx) {
      const action = nav.idx > prev.idx ? ({type: 'next'} as const) : ({type: 'previous'} as const)
      for (const event of eventsFor(action, prev, nav, {
        deck_id: deckSlug,
        language,
        game: GAMES.PICK,
      })) {
        track(event)
      }
    }
    prevNavRef.current = nav
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.idx, nav.ids])

  // question shown + dwell start on every reveal (incl. re-reads via Back)
  useEffect(() => {
    if (!onCard || !questionId) return
    track({
      name: EVENTS.QUESTION_SHOWN,
      props: {deck_id: deckSlug, question_id: questionId, language, source: 'pick'},
    })
    viewTracker.startView({deck_id: deckSlug, question_id: questionId, language})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCard, questionId])

  const maybeRequestReview = useReviewPrompt()
  const sessionCountedRef = useRef(false)

  useEffect(() => {
    void flush(send)
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void flush(send)
      if (state === 'background' || state === 'inactive') {
        viewTracker.endView('backgrounded')
        void maybeRequestReview()
      }
    })
    return () => sub.remove()
  }, [viewTracker, maybeRequestReview])

  // one Answer per Card served — only a revealed card counts (phase === 'card')
  useEffect(() => {
    if (!onCard || !questionId) return
    let cancelled = false
    void getDeviceId().then((deviceId) => {
      if (cancelled) return
      void enqueue({deviceId, deckSlug, questionId, language}, send)
    })
    void incrementCardCount()
    if (!sessionCountedRef.current) {
      sessionCountedRef.current = true
      void incrementSessionCount()
    }
    return () => {
      cancelled = true
    }
  }, [onCard, questionId, deckSlug, language])

  // --- box measurement for the question face (same approach as DeckPlayer) ---
  const {width: winWidth, height: winHeight} = useWindowDimensions()
  const [box, setBox] = useState<{width: number; height: number} | null>(null)
  const onBoxLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout
    setBox((prev) => (prev?.width === width && prev?.height === height ? prev : {width, height}))
  }, [])
  const measured = box ?? {width: winWidth - 64, height: winHeight - 220}

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

  // --- the deal: a reanimated 3D flip. Two absolutely-positioned faces with
  // backfaceVisibility hidden — the back rotates 0→180°, the face 180→360° —
  // under a shared perspective. translateX (the swipe) composes on the wrapper. ---
  const flip = useSharedValue(0)
  const translateX = useSharedValue(0)

  useEffect(() => {
    if (!onCard) return
    flip.set(0)
    flip.set(withTiming(1, {duration: reduceMotion ? 0 : FLIP_MS}))
  }, [onCard, flip, reduceMotion])

  // reset the swipe offset whenever a card is (re)dealt or put down
  useEffect(() => {
    translateX.set(0)
  }, [phase, questionId, translateX])

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      [-SWIPE_OFF_SCREEN, 0, SWIPE_OFF_SCREEN],
      [0, 1, 0],
      'clamp'
    ),
    transform: [{translateX: translateX.get()}],
  }))
  const backStyle = useAnimatedStyle(() => ({
    transform: [{perspective: 1000}, {rotateY: `${interpolate(flip.get(), [0, 1], [0, 180])}deg`}],
    backfaceVisibility: 'hidden' as const,
  }))
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      {perspective: 1000},
      {rotateY: `${interpolate(flip.get(), [0, 1], [180, 360])}deg`},
    ],
    backfaceVisibility: 'hidden' as const,
  }))

  // --- actions ---
  const handlePick = useCallback(() => {
    impact('medium')
    revealChrome()
    track({name: EVENTS.CARD_PICKED, props: {deck_id: deckSlug, game: GAMES.PICK}})
    dispatch({type: 'pick'})
  }, [deckSlug, revealChrome])

  const putDown = useCallback(() => {
    selection()
    viewTracker.endView('advanced')
    dispatch({type: 'next'})
  }, [viewTracker])

  const goNext = useCallback(() => {
    if (!onCard) {
      handlePick()
      return
    }
    revealChrome()
    putDown()
  }, [onCard, handlePick, revealChrome, putDown])

  const goPreviousFromCard = useCallback(() => {
    selection()
    viewTracker.endView('previous')
    dispatch({type: 'previous'})
  }, [viewTracker])

  const goPrevious = useCallback(() => {
    revealChrome()
    if (onCard) {
      goPreviousFromCard()
      return
    }
    // pick screen: Back re-reads the last dealt card (no-op before the first deal)
    selection()
    dispatch({type: 'previous'})
  }, [onCard, revealChrome, goPreviousFromCard])

  const handleExit = useCallback(() => {
    void maybeRequestReview()
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router, maybeRequestReview])

  const handleShare = useCallback(() => {
    if (!onCard || !text) return
    const url = buildShareUrl(deckSlug, language, questionId)
    void Share.share({message: `${text}\n\n${url}`, url})
  }, [onCard, text, deckSlug, language, questionId])

  const openLanguage = useCallback(() => setLangModalOpen(true), [])

  // --- gestures: swipe navigates only while a card is revealed; a swipe never
  // deals. On the pick screen only the tap (chrome reveal) is mounted. ---
  const isAtFirstSV = useSharedValue(nav.idx === 0)
  useEffect(() => {
    isAtFirstSV.set(nav.idx === 0)
  }, [nav.idx, isAtFirstSV])

  const reduceMotionSV = useSharedValue(reduceMotion)
  useEffect(() => {
    reduceMotionSV.set(reduceMotion)
  }, [reduceMotion, reduceMotionSV])

  const revealChromeStable = useCallback(() => revealChrome(), [revealChrome])
  const impactMediumOnJS = useCallback(() => impact('medium'), [])

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onStart(() => {
      'worklet'
      runOnJS(revealChromeStable)()
    })
    if (!onCard) return tap

    const pan = Gesture.Pan()
      .onBegin(() => {
        'worklet'
        runOnJS(revealChromeStable)()
      })
      .onUpdate((event) => {
        'worklet'
        const tx = event.translationX
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

        // commit "put down" (back to the pick screen): swipe left or fast fling
        if (tx <= -SWIPE_THRESHOLD || vx < -500) {
          runOnJS(impactMediumOnJS)()
          translateX.set(
            withTiming(-travel, {duration: reduceMotionSV.get() ? 0 : 260}, () => {
              'worklet'
              runOnJS(putDown)()
            })
          )
          return
        }
        // commit previous: swipe right (not while rubber-banded at the first card)
        if ((tx >= SWIPE_THRESHOLD || vx > 500) && !isAtFirstSV.get()) {
          runOnJS(impactMediumOnJS)()
          translateX.set(
            withTiming(travel, {duration: reduceMotionSV.get() ? 0 : 260}, () => {
              'worklet'
              runOnJS(goPreviousFromCard)()
            })
          )
          return
        }
        translateX.set(withSpring(0, {damping: 20, stiffness: 300}))
      })

    return Gesture.Race(tap, pan)
  }, [
    onCard,
    revealChromeStable,
    putDown,
    goPreviousFromCard,
    impactMediumOnJS,
    translateX,
    isAtFirstSV,
    reduceMotionSV,
  ])

  return (
    <ScreenBackground>
      <View className="flex-1">
        <GestureDetector gesture={gesture}>
          <View className="flex-1 px-8" style={{paddingTop: topBarH, paddingBottom: bottomBarH}}>
            <View className="flex-1 justify-center" onLayout={onBoxLayout}>
              {!languageReady ? null : onCard ? (
                <Animated.View style={wrapperStyle}>
                  {/* card back — visible through the first half of the flip */}
                  <Animated.View
                    style={backStyle}
                    className="absolute inset-0 items-center justify-center rounded-3xl border border-white/10 bg-dark"
                  >
                    <Text className="font-title text-7xl text-yellow-400">?</Text>
                  </Animated.View>
                  {/* question face — revealed through the second half */}
                  <Animated.View style={faceStyle} className="justify-center">
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
                </Animated.View>
              ) : (
                <View className="items-center">
                  <PressableScale
                    onPress={handlePick}
                    accessibilityRole="button"
                    accessibilityLabel="Pick a card"
                    className="active:bg-yellow-500 w-full flex-row items-center justify-center rounded-full bg-yellow-400 py-4"
                  >
                    <Ionicons
                      name="albums-outline"
                      size={18}
                      color={colors.darker}
                      style={{marginRight: 8}}
                    />
                    <Text className="text-darker font-sans text-base font-bold">Pick a card</Text>
                  </PressableScale>
                </View>
              )}
            </View>
          </View>
        </GestureDetector>

        {/* close — top-right chip; slides up out of view when the chrome hides */}
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

        {/* bottom action bar — Share only once a card has been dealt */}
        <Animated.View
          pointerEvents={chromeShown ? 'box-none' : 'none'}
          onLayout={onBottomBarLayout}
          className="absolute inset-x-0 bottom-0"
          style={bottomChromeStyle}
        >
          <PlayerBar
            showLanguage={languages.length > 1}
            showShare={dealt}
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
      </View>
    </ScreenBackground>
  )
}
