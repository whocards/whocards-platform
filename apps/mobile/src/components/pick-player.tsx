import {Image} from 'expo-image'

import {ScreenBackground} from '@/components/screen-background'
import {useRouter} from 'expo-router'
import {StatusBar} from 'expo-status-bar'
import {useColorScheme} from 'nativewind'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {AppStateStatus, LayoutChangeEvent} from 'react-native'
import {AppState, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {QuestionSet} from '@whocards/decks'
import {getInitialPick, pickReducer} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'
import {EVENTS, GAMES, eventsFor, createViewTracker, track} from '@whocards/observability/events'

import {PlayerBar} from '@/components/player-bar'
import {PressableScale} from '@/components/pressable-scale'
import {LINE_HEIGHT_RATIO, QuestionText} from '@/components/question-text'
import type {ShareFormat} from '@/components/share-modal'
import {ShareModal} from '@/components/share-modal'
import {usePlayerChrome} from '@/hooks/use-player-chrome'
import {useReviewPrompt} from '@/hooks/use-review-prompt'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {incrementCardCount, incrementSessionCount} from '@/lib/app-review'
import {getDeviceId} from '@/lib/device-id'
import {impact, selection} from '@/lib/haptics'
import {getStoredLanguage, getStoredSecondaryLanguages} from '@/lib/language-store'
import {buildShareCardUrl, buildShareUrl} from '@/lib/share-url'

// Full card flip (deal → reveal) duration; DESIGN.md's 200–300 ms band applies to
// interaction transitions — the deal is the one composed "moment of theatre" per card.
const FLIP_MS = 450
// Physical-card proportions (width / height, ~poker card) for the deck and the
// flipped question card.
const CARD_ASPECT = 0.72
const CARD_PADDING_X = 28
const CARD_PADDING_Y = 44
// The tap instruction sits in one place well below the deck: a fixed-height band
// (so the card never jumps between phases) pushed down by a gap.
const HINT_SPACE = 40
const HINT_GAP = 28
// The under-cards peeking out beneath the top of the deck (and beneath the card
// mid-flip): slight rotation + downward offset per layer.
const DECK_LAYERS = [
  {rotate: '-3deg', translateY: 10},
  {rotate: '2deg', translateY: 5},
] as const

// The corner "?" glyph's own size — matches Tailwind's text-6xl fontSize, but
// with an explicit lineHeight (the same ratio question-text.tsx uses for every
// other piece of card text) instead of Tailwind's zero-headroom default, so the
// glyph's ascender has room and isn't clipped by the face's overflow-hidden
// (issue #189).
const QUESTION_MARK_SIZE = 60
const QUESTION_MARK_LINE_HEIGHT = QUESTION_MARK_SIZE * LINE_HEIGHT_RATIO

// The same texture as the printed card backs (rasterized from the website's
// bg-hero squiggle — also used by ScreenBackground).
const texture = require('../../assets/images/background.png')

/**
 * The card back, styled after the printed WhoCards deck: the brand squiggle
 * texture over the darkest base and the one-line WHO?CARDS wordmark bottom-right.
 */
const CardBack = () => (
  <View className="bg-darkest absolute inset-0 overflow-hidden rounded-[20px] border border-white/10">
    <Image source={texture} contentFit="cover" style={StyleSheet.absoluteFill} />
    <Text style={{fontSize: 26}} className="absolute bottom-5 right-5 font-title text-yellow-400">
      WHO<Text className="text-primary-dark">?</Text>
      <Text className="text-white">CARDS</Text>
    </Text>
  </View>
)

type PickPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
  /** Is this deck's content resolved from the global Pool (`isPoolBacked`)? Gates the
   *  Share sheet's image rows — the Share Card endpoint only resolves Pool ids. */
  poolBacked: boolean
}

/**
 * The Pick a Card Game (CONTEXT.md): the player deals each Card deliberately —
 * a big "Pick a card" action flips the next question face-up, and moving on
 * returns to the pick screen rather than straight to another Card. Draw policy
 * is the same non-repeating shuffle as Classic (the engine's pickReducer
 * composes navReducer); only the reveal ritual differs.
 */
export const PickPlayer = ({
  deckSlug,
  questionIds,
  questions,
  languages,
  poolBacked,
}: PickPlayerProps) => {
  const router = useRouter()
  const reduceMotion = useReducedMotion()

  // Themed (issue #173): the canvas/chrome around the deck follows the Theme
  // Display setting like every other screen now; the deck/card faces below
  // (CardBack, the revealed face) are untouched — they stay dark in both themes
  // (amendment 2, docs/design/163-light-mode/proposal.md).
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'

  const reducer = useMemo(() => pickReducer(questionIds), [questionIds])
  const [{nav, phase, dealt}, dispatch] = useReducer(reducer, questionIds, getInitialPick)
  const onCard = phase === 'card'

  const defaultLanguage = languages[0]
  const [language, setLanguage] = useState(defaultLanguage)
  // secondary display language rendered under the primary (a Display setting,
  // issue #176: at most one now, not up to two) — read-only here, same as
  // DeckPlayer: set from the home-screen Settings menu, not from this screen.
  const [secondary, setSecondary] = useState<string[]>([])
  // gate the first reveal on the stored-language read, mirroring DeckPlayer
  const [languageReady, setLanguageReady] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)

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

  // --- card geometry: a physical-card aspect centred in the measured box (minus
  // the full hint band incl. its gap), so the deck and the flipped question read
  // as the same object and the stack never overflows on short screens ---
  const cardWidth = Math.round(
    Math.min(measured.width, (measured.height - HINT_SPACE - HINT_GAP) * CARD_ASPECT)
  )
  const cardHeight = Math.round(cardWidth / CARD_ASPECT)
  // the question face's inner box (card padding subtracted) drives fitFontSize
  const cardInner = {width: cardWidth - CARD_PADDING_X * 2, height: cardHeight - CARD_PADDING_Y * 2}

  const {chromeShown, revealChrome, bottomBarH, onBottomBarLayout, bottomChromeStyle} =
    usePlayerChrome()
  // The top-right close chip (and its reserved band) is gone — Exit moved into the
  // bottom bar (issue #186). The deck/card still needs to clear the status bar/notch,
  // so its top padding is the raw safe-area inset now instead of a measured chip height.
  const insets = useSafeAreaInsets()

  // --- the deal: a reanimated 3D flip. Two absolutely-positioned faces with
  // backfaceVisibility hidden — the back rotates 0→180°, the face 180→360° —
  // under a shared perspective. ---
  const flip = useSharedValue(0)

  useEffect(() => {
    if (!onCard) return
    flip.set(0)
    flip.set(withTiming(1, {duration: reduceMotion ? 0 : FLIP_MS}))
  }, [onCard, flip, reduceMotion])

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [
      // a slight lift-and-settle arc through the flip, so the card reads as
      // picked up off the deck rather than spun in place
      {translateY: interpolate(flip.get(), [0, 0.5, 1], [0, -16, 0])},
      {scale: interpolate(flip.get(), [0, 0.5, 1], [1, 1.04, 1])},
    ],
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

  // guards a second put-down (or a previous) while the exit flip is running
  const exitingRef = useRef(false)

  const commitPutDown = useCallback(() => {
    exitingRef.current = false
    viewTracker.endView('advanced')
    dispatch({type: 'next'})
  }, [viewTracker])

  // putting the card down flips it face-down again before the deck returns —
  // the exit half of the deal ritual (the swipe path exits by sliding off instead)
  const putDown = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    selection()
    flip.set(
      withTiming(0, {duration: reduceMotion ? 0 : FLIP_MS}, () => {
        'worklet'
        runOnJS(commitPutDown)()
      })
    )
  }, [flip, reduceMotion, commitPutDown])

  const goNext = useCallback(() => {
    if (!onCard) {
      handlePick()
      return
    }
    revealChrome()
    putDown()
  }, [onCard, handlePick, revealChrome, putDown])

  const goPreviousFromCard = useCallback(() => {
    if (exitingRef.current) return
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
    setShareModalOpen(true)
  }, [onCard, text])

  const handleShareCompleted = useCallback(
    (format: ShareFormat) => {
      track({
        name: EVENTS.SHARE_COMPLETED,
        props: {deck_id: deckSlug, question_id: questionId, language, game: GAMES.PICK, format},
      })
    },
    [deckSlug, questionId, language]
  )

  // --- gestures: tap anywhere reveals the chrome. No swipes — the card itself is
  // the button in both phases (tap to deal, tap to put down); Back lives in the bar. ---
  const revealChromeStable = useCallback(() => revealChrome(), [revealChrome])

  const gesture = useMemo(
    () =>
      Gesture.Tap().onStart(() => {
        'worklet'
        runOnJS(revealChromeStable)()
      }),
    [revealChromeStable]
  )

  return (
    // Same textured canvas as the landing page (owner, live session 2026-07-03):
    // the table is the brand backdrop, not a plain solid — the deck and cards on
    // it stay dark in both themes (untouched below).
    <ScreenBackground table>
      {/* Pick a Card is chrome-themed like every other screen now (issue #173); this
          screen's own override wins over the root default while it's mounted
          (expo-status-bar: "last mounted wins, revert on unmount" — see index.tsx). */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1">
        <GestureDetector gesture={gesture}>
          <View className="flex-1 px-8" style={{paddingTop: insets.top, paddingBottom: bottomBarH}}>
            <View className="flex-1 items-center justify-center" onLayout={onBoxLayout}>
              {!languageReady ? null : onCard ? (
                <View className="items-center">
                  {/* the whole card is the put-down target; accessible={false} keeps the
                      question text readable to VoiceOver (a labeled button would swallow
                      it) — screen-reader users advance via the bar's Next instead */}
                  <Pressable
                    onPress={goNext}
                    accessible={false}
                    style={{width: cardWidth, height: cardHeight}}
                  >
                    {/* the rest of the deck stays visible beneath the revealed card */}
                    <View className="absolute inset-0" pointerEvents="none">
                      {DECK_LAYERS.map(({rotate, translateY}) => (
                        <View
                          key={rotate}
                          style={{transform: [{rotate}, {translateY}]}}
                          className="bg-dark/80 absolute inset-0 rounded-[20px] border border-white/10"
                        />
                      ))}
                    </View>
                    <Animated.View style={wrapperStyle} className="absolute inset-0">
                      {/* card back — visible through the first half of the flip */}
                      <Animated.View style={backStyle} className="absolute inset-0">
                        <CardBack />
                      </Animated.View>
                      {/* question face — revealed through the second half: the question
                          from the top-left over a whisper of the brand texture, with a
                          big violet ? anchoring the bottom-right corner */}
                      <Animated.View
                        style={faceStyle}
                        className="bg-darker absolute inset-0 overflow-hidden rounded-[20px] border border-white/10"
                      >
                        <Image
                          source={texture}
                          contentFit="cover"
                          style={[StyleSheet.absoluteFill, {opacity: 0.4}]}
                        />
                        {/* Tailwind's text-6xl sets lineHeight:1 — exactly fontSize, zero
                            headroom above the glyph's own metrics. font-title's ascender on
                            "?" sits taller than that box reports, so with no room to spare
                            the parent's overflow-hidden clips its top (issue #189). The same
                            LINE_HEIGHT_RATIO headroom question-text.tsx already gives every
                            other piece of text on the card fixes it here too; growing the box
                            upward while `bottom` stays put keeps the glyph's visual anchor in
                            the same corner. */}
                        <Text
                          className="text-primary-dark absolute bottom-3 right-5 font-title"
                          style={{
                            fontSize: QUESTION_MARK_SIZE,
                            lineHeight: QUESTION_MARK_LINE_HEIGHT,
                          }}
                        >
                          ?
                        </Text>
                        <View
                          className="flex-1 justify-start"
                          style={{
                            paddingHorizontal: CARD_PADDING_X,
                            paddingVertical: CARD_PADDING_Y,
                          }}
                        >
                          <QuestionText
                            text={text}
                            language={language}
                            box={cardInner}
                            secondaries={secondary
                              .filter((code) => code !== language)
                              .map((code) => ({
                                language: code,
                                text: questions[questionId]?.[code] ?? '',
                              }))}
                          />
                        </View>
                      </Animated.View>
                    </Animated.View>
                  </Pressable>
                  <Pressable
                    onPress={goNext}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Tap for next card"
                    style={{height: HINT_SPACE, marginTop: HINT_GAP}}
                    className="justify-center"
                  >
                    <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                      Tap for next card
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="items-center">
                  <View style={{width: cardWidth, height: cardHeight}}>
                    {/* the deck: under-cards peeking out beneath the top card */}
                    {DECK_LAYERS.map(({rotate, translateY}) => (
                      <View
                        key={rotate}
                        style={{transform: [{rotate}, {translateY}]}}
                        className="bg-dark/80 absolute inset-0 rounded-[20px] border border-white/10"
                      />
                    ))}
                    <PressableScale
                      onPress={handlePick}
                      accessibilityRole="button"
                      accessibilityLabel="Pick a card"
                      className="absolute inset-0"
                    >
                      <CardBack />
                    </PressableScale>
                  </View>
                  <Pressable
                    onPress={handlePick}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Tap to pick a card"
                    style={{height: HINT_SPACE, marginTop: HINT_GAP}}
                    className="justify-center"
                  >
                    <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                      Tap to pick a card
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </GestureDetector>

        {/* bottom action bar — Share only once a card has been dealt. Exit lives
            mid-bar now (issue #186); the top-right close chip is gone, so this bar
            is the only exit while the chrome is hidden. */}
        <Animated.View
          pointerEvents={chromeShown ? 'box-none' : 'none'}
          onLayout={onBottomBarLayout}
          className="absolute inset-x-0 bottom-0"
          style={bottomChromeStyle}
        >
          <PlayerBar
            showShare={dealt}
            onPrevious={goPrevious}
            onNext={goNext}
            onShare={handleShare}
            onExit={handleExit}
          />
        </Animated.View>

        <ShareModal
          visible={shareModalOpen}
          questionText={text}
          shareUrl={buildShareUrl(deckSlug, language, questionId)}
          storyImageUrl={poolBacked ? buildShareCardUrl('story', language, questionId) : undefined}
          postImageUrl={poolBacked ? buildShareCardUrl('post', language, questionId) : undefined}
          onShare={handleShareCompleted}
          onClose={() => setShareModalOpen(false)}
        />
      </View>
    </ScreenBackground>
  )
}
