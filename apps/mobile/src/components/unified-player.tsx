import * as Linking from 'expo-linking'
import {useRouter} from 'expo-router'
import {StatusBar} from 'expo-status-bar'
import {useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {AppStateStatus, LayoutChangeEvent} from 'react-native'
import {AppState, Image, Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {GameId, NavAction, NavState, PickPhase, QuestionSet} from '@whocards/decks'
import {
  DEFAULT_GAME,
  getInitialNav,
  getInitialPick,
  navReducer,
  pickReducer,
  shuffle,
} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'
import {createViewTracker, EVENTS, eventsFor, GAMES, track} from '@whocards/observability/events'
import type {ShareEventName} from '@whocards/observability/events'

import {PlayerBar} from '@/components/player-bar'
import {PressableScale} from '@/components/pressable-scale'
import {LINE_HEIGHT_RATIO, QuestionText} from '@/components/question-text'
import {ScreenBackground} from '@/components/screen-background'
import {SettingsModal, SHEET_CLOSE_MS} from '@/components/settings-modal'
import type {ShareFormat} from '@/components/share-modal'
import {ShareModal} from '@/components/share-modal'
import {usePlayerChrome} from '@/hooks/use-player-chrome'
import {useReviewPrompt} from '@/hooks/use-review-prompt'
import {useThemeSetting} from '@/hooks/use-theme-setting'
import {enqueue, flush} from '@/lib/answer-queue'
import {send} from '@/lib/answer-transport'
import {incrementCardCount, incrementSessionCount} from '@/lib/app-review'
import {getStoredCardAnimation} from '@/lib/card-animation-store'
import type {CardAnimation} from '@/lib/card-animation-store'
import {useIsDark} from '@/lib/color-scheme'
import {getDeviceId} from '@/lib/device-id'
import {impact, selection} from '@/lib/haptics'
import {useT} from '@/lib/i18n'
import {deviceLanguage} from '@/lib/device-language'
import {getStoredLanguage, getStoredSecondaryLanguages} from '@/lib/language-store'
import {MOTION_DURATION, MOTION_EASING, motionDuration} from '@/lib/motion'
import {notePromptShown} from '@/lib/notification-store'
import {parsePlayLink} from '@/lib/play-link'
import {
  consumePendingPlayEntrance,
  getActivePlayTransition,
  notifyReturnedHome,
  reportPlayTargetMetrics,
  startExitTransition,
  subscribePlayTransition,
} from '@/lib/play-transition'
import {buildShareCardUrl, buildShareUrl} from '@/lib/share-url'
import {getStoredTabletopMode} from '@/lib/tabletop-store'

const SWIPE_THRESHOLD = 60
const TURN_DRAG = 260
const FLIP_DRAG = 200
const CARD_ASPECT = 0.72
const CARD_PADDING_X = 28
const CARD_PADDING_Y = 44
const HINT_SPACE = 40
const HINT_GAP = 28
const DECK_LAYERS = [
  {rotate: '-3deg', translateY: 10},
  {rotate: '2deg', translateY: 5},
] as const

const QUESTION_MARK_SIZE = 60
const QUESTION_MARK_LINE_HEIGHT = QUESTION_MARK_SIZE * LINE_HEIGHT_RATIO
const CARD_Q_RIGHT = 18
const CARD_Q_BOTTOM = 12
const CLASSIC_Q_RIGHT = 28
const CLASSIC_Q_BOTTOM = 20

const texture = require('../../assets/images/background.png')
const DECK_TEXTURE_WAIT_MS = 150
// Face-up Cards are printed on linen stock; tiled at device pixels so each thread is one pixel.
const linen = require('../../assets/images/linen.png')

const CardFaceLinen = () => (
  <Image
    source={linen}
    resizeMode="repeat"
    fadeDuration={0}
    style={[StyleSheet.absoluteFill, {width: '100%', height: '100%'}]}
  />
)

/**
 * The card back, styled after the printed WhoCards deck: the brand squiggle
 * texture over the darkest base and the one-line WHO?CARDS wordmark bottom-right.
 */
/** A Question face's edge, drawn over it so the border never insets the text the Game switch lands on. */
const CardEdge = () => (
  <View pointerEvents="none" className="absolute inset-0 rounded-[20px] border border-white/10" />
)

export const CardBack = ({
  hideWordmark = false,
  onWordmarkLayout,
  onTextureLoad,
}: {
  hideWordmark?: boolean
  onWordmarkLayout?: (size: {width: number; height: number}) => void
  onTextureLoad?: () => void
} = {}) => (
  <View className="bg-darkest absolute inset-0 overflow-hidden rounded-[20px] border border-white/10">
    <Image
      source={texture}
      onLoad={onTextureLoad}
      resizeMode="cover"
      fadeDuration={0}
      style={[StyleSheet.absoluteFill, {width: '100%', height: '100%'}]}
    />
    {/* Always mounted so onLayout measures exact native wordmark bounds on frame 0;
        hide via opacity during Home↔Deck transition for an atomic 0px handoff. */}
    <Text
      onLayout={
        onWordmarkLayout
          ? (event) => {
              const {width, height} = event.nativeEvent.layout
              if (width > 0 && height > 0) onWordmarkLayout({width, height})
            }
          : undefined
      }
      style={[
        {position: 'absolute', bottom: 20, right: 20, fontSize: 26},
        hideWordmark ? {opacity: 0} : undefined,
      ]}
      className="font-title text-yellow-400"
    >
      WHO<Text className="text-primary-dark">?</Text>
      <Text className="text-white">CARDS</Text>
    </Text>
  </View>
)

type PlayState = {
  nav: NavState
  phase: PickPhase
  dealt: boolean
  /** Furthest nav index dealt so far: moving forward before it skips face-down re-reveal. */
  highestDealtIdx: number
}

type UnifiedAction =
  | {type: 'classic_nav'; action: NavAction}
  | {type: 'pick_deal'}
  | {type: 'pick_put_down'}
  | {type: 'pick_advance_seen'}
  | {type: 'pick_previous'}
  | {type: 'switch_game'; to: GameId}

const createPlayReducer = (questionIds: string[]) => {
  const navStep = navReducer(questionIds)
  const pickStep = pickReducer(questionIds)
  return (state: PlayState, action: UnifiedAction): PlayState => {
    switch (action.type) {
      case 'classic_nav': {
        const nextNav = navStep(state.nav, action.action)
        const highest =
          action.action.type === 'reset'
            ? nextNav.idx
            : Math.max(state.highestDealtIdx, nextNav.idx)
        return {nav: nextNav, phase: 'card', dealt: true, highestDealtIdx: highest}
      }
      case 'pick_deal': {
        const next = pickStep(
          {nav: state.nav, phase: state.phase, dealt: state.dealt},
          {type: 'pick'}
        )
        return {
          ...next,
          highestDealtIdx: Math.max(state.highestDealtIdx, next.nav.idx),
        }
      }
      case 'pick_put_down': {
        const next = pickStep(
          {nav: state.nav, phase: state.phase, dealt: state.dealt},
          {type: 'next'}
        )
        return {...next, highestDealtIdx: state.highestDealtIdx}
      }
      case 'pick_advance_seen': {
        if (state.nav.idx >= state.highestDealtIdx) return state
        const nextNav = navStep(state.nav, {type: 'next'})
        return {
          nav: nextNav,
          phase: 'card',
          dealt: true,
          highestDealtIdx: Math.max(state.highestDealtIdx, nextNav.idx),
        }
      }
      case 'pick_previous': {
        const next = pickStep(
          {nav: state.nav, phase: state.phase, dealt: state.dealt},
          {type: 'previous'}
        )
        return {...next, highestDealtIdx: state.highestDealtIdx}
      }
      case 'switch_game': {
        if (action.to === 'pick') {
          return {
            nav: state.nav,
            phase: state.dealt ? 'card' : 'pick',
            dealt: state.dealt,
            highestDealtIdx: state.highestDealtIdx,
          }
        }
        return {
          nav: state.nav,
          phase: 'card',
          dealt: true,
          highestDealtIdx: Math.max(state.highestDealtIdx, state.nav.idx),
        }
      }
      default:
        return state
    }
  }
}

export type UnifiedPlayerProps = {
  deckSlug: string
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
  poolBacked: boolean
  initialGame: GameId
  startId?: string
  startLanguage?: string
  /** Optional external callback (used by PickPlayer wrapper tests). */
  onChangeGame?: (game: GameId) => void
}

/**
 * Unified play screen for both Classic and Pick a Card: one mounted canvas, bar,
 * modals, settings, and Question surface so switching Games runs purely on GPU
 * transforms with zero unmount flashes or crossfaded text.
 */
export const UnifiedPlayer = ({
  deckSlug,
  questionIds,
  questions,
  languages,
  poolBacked,
  initialGame,
  startId,
  startLanguage,
  onChangeGame,
}: UnifiedPlayerProps) => {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const isDark = useIsDark()
  const copy = useT()
  const insets = useSafeAreaInsets()
  const {width: winWidth, height: winHeight} = useWindowDimensions()

  const [game, setGame] = useState<GameId>(initialGame)
  const isPick = game === 'pick'
  const analyticsGame = isPick ? GAMES.PICK : GAMES.WH

  const reducer = useMemo(() => createPlayReducer(questionIds), [questionIds])
  const [state, dispatch] = useReducer(reducer, undefined, (): PlayState => {
    if (initialGame === 'pick' && !startId) {
      const initial = getInitialPick(questionIds)
      return {...initial, highestDealtIdx: -1}
    }
    const nav = getInitialNav(questionIds, startId)
    return {nav, phase: 'card', dealt: true, highestDealtIdx: nav.idx}
  })

  const {nav, phase, dealt, highestDealtIdx} = state
  const {ids, idx} = nav
  const onCard = !isPick || phase === 'card'
  const isAtFirst = idx === 0
  const hasSeenNext = isPick && phase === 'card' && idx < highestDealtIdx

  const lastNavActionRef = useRef<NavAction | null>(null)
  const defaultLanguage = useMemo(() => deviceLanguage(languages), [languages])
  const linkLanguage =
    startLanguage && languages.includes(startLanguage) ? startLanguage : undefined

  const [language, setLanguage] = useState(linkLanguage ?? defaultLanguage)
  const [secondary, setSecondary] = useState<string[]>([])
  const [tabletop, setTabletop] = useState(false)
  const [cardAnimation, setCardAnimation] = useState<CardAnimation>('slide')
  const [languageReady, setLanguageReady] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const {theme, select: selectTheme} = useThemeSetting()

  // Bumped when a warm link sets the Language, so a stored-language read already in flight can't undo it.
  const linkLanguageEpochRef = useRef(0)
  const pickedLanguageRef = useRef<string | undefined>(undefined)
  const pickedGameRef = useRef<GameId | undefined>(undefined)
  const sheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current)
    },
    []
  )

  const readSettings = useCallback(
    (keepLanguage: boolean) => {
      const epoch = linkLanguageEpochRef.current
      return Promise.all([
        getStoredLanguage(deckSlug).then((stored) => {
          if (
            stored &&
            languages.includes(stored) &&
            !keepLanguage &&
            epoch === linkLanguageEpochRef.current
          ) {
            setLanguage(stored)
          }
        }),
        getStoredSecondaryLanguages(deckSlug).then((stored) =>
          setSecondary(stored.filter((code) => languages.includes(code)))
        ),
        getStoredTabletopMode().then(setTabletop),
        getStoredCardAnimation().then(setCardAnimation),
      ])
    },
    [deckSlug, languages]
  )

  useEffect(() => {
    if (linkLanguage) setLanguage(linkLanguage)
    void readSettings(linkLanguage !== undefined).then(() => setLanguageReady(true))
  }, [readSettings, linkLanguage])

  // Warm deep link handling for both Games (deep links always show Classic).
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({url}) => {
      const link = parsePlayLink(url)
      if (!link || link.deck !== deckSlug) return
      if (link.lang && languages.includes(link.lang)) {
        linkLanguageEpochRef.current += 1
        setLanguage(link.lang)
      }
      // Like a cold link: any `q` opens Classic, a removed one on a fresh shuffle.
      if (link.q) {
        lastNavActionRef.current = {type: 'reset', startId: link.q}
        setGame(DEFAULT_GAME)
        morph.set(0)
        dispatch({type: 'classic_nav', action: {type: 'reset', startId: link.q}})
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSlug, languages, questionIds])

  const questionId = ids[idx]
  const textOf = useCallback(
    (qId: string | undefined) =>
      qId ? (questions[qId]?.[language] ?? questions[qId]?.[defaultLanguage] ?? '') : '',
    [questions, language, defaultLanguage]
  )
  const secondariesOf = useCallback(
    (qId: string | undefined) =>
      qId
        ? secondary
            .filter((code) => code !== language)
            .map((code) => ({language: code, text: questions[qId]?.[code] ?? ''}))
        : [],
    [secondary, language, questions]
  )

  const text = textOf(questionId)
  const activeSecondaries = useMemo(() => secondariesOf(questionId), [secondariesOf, questionId])
  const isSplit = tabletop || activeSecondaries.some((entry) => entry.text)

  // On the last Question, `next` appends a fresh shuffle; drawing it now lets the incoming Card show its first Question.
  const upcomingCycle = useMemo(
    () => (idx >= ids.length - 1 ? shuffle(questionIds) : undefined),
    [idx, ids.length, questionIds]
  )
  // Peek neighbor ids for live flip & slide transitions (only mounted when transitioning).
  const nextQuestionId = ids[idx + 1] ?? upcomingCycle?.[0]
  const prevQuestionId = idx > 0 ? ids[idx - 1] : undefined

  // --- observability ---
  const viewTracker = useMemo(() => createViewTracker(trackEvent), [])
  const prevNavRef = useRef<{ids: string[]; idx: number} | null>(null)
  const sessionCountedRef = useRef(false)
  const maybeRequestReview = useReviewPrompt()

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
      props: {
        deck_id: deckSlug,
        game: analyticsGame,
        language,
        secondary_languages: secondary,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady])

  useEffect(() => {
    void flush(send)
    const sub = AppState.addEventListener('change', (appState: AppStateStatus) => {
      if (appState === 'active') void flush(send)
      if (appState === 'background' || appState === 'inactive') {
        viewTracker.endView('backgrounded')
        void maybeRequestReview()
      }
    })
    return () => sub.remove()
  }, [viewTracker, maybeRequestReview])

  const recordedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!languageReady || !onCard || !questionId) return undefined
    const key = `${questionId}:${language}`
    if (recordedKeyRef.current === key) return undefined
    recordedKeyRef.current = key
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
  }, [languageReady, onCard, questionId, deckSlug, language])

  useEffect(() => {
    const prev = prevNavRef.current
    if (prev && prev.idx !== idx) {
      const action =
        lastNavActionRef.current ??
        (idx > prev.idx ? ({type: 'next'} as const) : ({type: 'previous'} as const))
      for (const event of eventsFor(action, prev, nav, {
        deck_id: deckSlug,
        language,
        game: analyticsGame,
      })) {
        track(event)
      }
      lastNavActionRef.current = null
    }
    prevNavRef.current = nav
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ids])

  useEffect(() => {
    if (!languageReady || !onCard || !questionId) return
    track({
      name: EVENTS.QUESTION_SHOWN,
      props: {
        deck_id: deckSlug,
        question_id: questionId,
        language,
        source: isPick ? 'pick' : 'nav',
      },
    })
    if (!isPick) notePromptShown({deck_id: deckSlug, question_id: questionId, language})
    viewTracker.startView({deck_id: deckSlug, question_id: questionId, language})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady, onCard, questionId])

  const {chromeShown, revealChrome, bottomBarH, onBottomBarLayout, bottomChromeStyle} =
    usePlayerChrome()

  // --- layout geometry: shared between Classic and Pick a Card ---
  const [box, setBox] = useState<{width: number; height: number} | null>(null)
  const onBoxLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout
    setBox((prev) => (prev?.width === width && prev?.height === height ? prev : {width, height}))
  }, [])
  const measured = box ?? {
    width: winWidth - 64,
    height: Math.max(200, winHeight - insets.top - bottomBarH),
  }

  const cardWidth = Math.round(
    Math.min(measured.width, (measured.height - HINT_SPACE - HINT_GAP) * CARD_ASPECT)
  )
  const cardHeight = Math.round(cardWidth / CARD_ASPECT)
  const cardInner = useMemo(
    () => ({width: cardWidth - CARD_PADDING_X * 2, height: cardHeight - CARD_PADDING_Y * 2}),
    [cardWidth, cardHeight]
  )
  const cardLeft = (winWidth - cardWidth) / 2
  const cardTop = insets.top + (measured.height - cardHeight - HINT_SPACE - HINT_GAP) / 2

  const [wordmarkSize, setWordmarkSize] = useState<{width: number; height: number} | null>(null)
  const [qMarkSize, setQMarkSize] = useState<{width: number; height: number} | null>(null)
  const onWordmarkLayout = useCallback((size: {width: number; height: number}) => {
    setWordmarkSize((prev) =>
      prev && prev.width === size.width && prev.height === size.height ? prev : size
    )
  }, [])
  const onQMarkLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout
    if (width <= 0 || height <= 0) return
    setQMarkSize((prev) =>
      prev && prev.width === width && prev.height === height ? prev : {width, height}
    )
  }, [])

  // Proportional scale locks identical line breaks between Classic and Card so ONE
  // single QuestionText stays on screen through the Game switch with zero fade.
  const classicScale = Math.min(
    measured.width / Math.max(1, cardInner.width),
    measured.height / Math.max(1, cardInner.height)
  )

  const [currContentH, setCurrContentH] = useState(0)
  const [peerContentH, setPeerContentH] = useState(0)

  // 5B Home ↔ Play vertical rise/drop (1 = below bottom edge, 0 = settled in place).
  // Atomic handoff: `transitionActive` tracks PlayTransitionOverlay directly so the
  // overlay unmounts and UnifiedPlayer's "?" / CardBack wordmark reveals in the exact same commit.
  const [fromHome] = useState(() => consumePendingPlayEntrance())
  // Rising in from Home, the first Deck decodes its texture a frame late, so it waits instead of flashing flat.
  const [deckTextureReady, setDeckTextureReady] = useState(() => !fromHome || reduceMotion)
  const onDeckTextureLoad = useCallback(() => setDeckTextureReady(true), [])
  const homeRise = useSharedValue(fromHome && !reduceMotion ? 1 : 0)
  const [transitionActive, setTransitionActive] = useState(() => getActivePlayTransition() !== null)
  const transitionActiveSV = useSharedValue(getActivePlayTransition() !== null ? 1 : 0)
  const [homeExiting, setHomeExiting] = useState(false)
  const exitingHomeRef = useRef(false)
  const exitNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const sync = (active: boolean) => {
      setTransitionActive(active)
      transitionActiveSV.set(active ? 1 : 0)
    }
    sync(getActivePlayTransition() !== null)
    return subscribePlayTransition((event) => sync(event !== null))
  }, [transitionActiveSV])

  // A slow texture (a dev build fetches it from Metro) must not hold the Deck off the table.
  useEffect(() => {
    if (deckTextureReady) return undefined
    const timer = setTimeout(() => setDeckTextureReady(true), DECK_TEXTURE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [deckTextureReady])

  // A face-down Deck rises once it can show its texture, still landing when the flying wordmark does.
  const riseWaitsForDeck = isPick && phase === 'pick' && !deckTextureReady
  const [mountedAt] = useState(() => Date.now())
  useEffect(() => {
    if (!fromHome || reduceMotion || riseWaitsForDeck) return
    const dur = Math.round(motionDuration(MOTION_DURATION.homeToPlay, false) * 0.56)
    homeRise.set(
      withTiming(0, {
        duration: Math.max(0, dur - (Date.now() - mountedAt)),
        easing: MOTION_EASING.enter,
      })
    )
  }, [fromHome, reduceMotion, homeRise, riseWaitsForDeck, mountedAt])

  const homeRiseStyle = useAnimatedStyle(() => ({
    transform: [{translateY: interpolate(homeRise.get(), [0, 1], [0, winHeight * 0.62], 'clamp')}],
  }))

  const barSlideStyle = useAnimatedStyle(() => ({
    transform: [{translateY: interpolate(homeRise.get(), [0, 1], [0, 140], 'clamp')}],
  }))

  // --- shared animation values ---
  // morph: 0 = Classic full screen, 1 = Pick a Card
  const morph = useSharedValue(initialGame === 'pick' ? 1 : 0)
  const [isMorphing, setIsMorphing] = useState(false)
  // The morphing Question rides the Game switch from Classic's centered pose to the Card's top-aligned one.
  const classicCentering = useDerivedValue(() => 1 - morph.get())

  // Classic flip: 0 = rest, +1 = turned 180° to Next, -1 = turned -180° to Previous.
  const classicFlip = useSharedValue(0)
  // Classic slide: 0 = rest, -winWidth = Next, +winWidth = Previous.
  const classicSlideX = useSharedValue(0)
  // Direction of active neighbor mounted for live Classic flip/slide (0 = none at rest).
  const [classicPeerDir, setClassicPeerDir] = useState<-1 | 0 | 1>(0)
  const classicBusy = useSharedValue(false)
  // Steps asked for mid-step (+ Next, - Back), run one after another so fast swipes each count.
  const classicQueueRef = useRef(0)

  // Pick a Card: flip (0 = CardBack, 1 = Question face), dragX (slide offset).
  const cardFlip = useSharedValue(initialGame === 'pick' && !startId ? 0 : 1)
  const dragX = useSharedValue(0)
  const pickBusy = useSharedValue(false)
  // Which way the Pick a Card flip turns: 1 toward Next (left), -1 toward Back (right).
  const flipSign = useSharedValue(1)
  // The previous Card sliding in over the open one: 0 = off to the left, 1 = covering it.
  const backIn = useSharedValue(0)
  // The face-down Deck hands over to the Card stage while its put-down Card comes back.
  const deckPeekSV = useSharedValue(false)
  const [deckPeek, setDeckPeek] = useState(false)
  // Faces held on their old Question while a Card moves over them (undefined = not held, null = CardBack).
  const [heldUnder, setHeldUnder] = useState<string | null | undefined>(undefined)
  const [heldPrev, setHeldPrev] = useState<string | undefined>(undefined)

  const turnsClassic = reduceMotion || cardAnimation === 'flip'
  const slidesPick = !reduceMotion && cardAnimation === 'slide'

  // Derived 0→1 mid-flip peak (1 right at ±90°, 0 everywhere else) for spine & divider shrink.
  const flipMid = useDerivedValue(() => {
    const abs = Math.abs(classicFlip.get())
    const dist = Math.abs(abs - 0.5)
    return Math.max(0, 1 - dist / 0.18)
  })

  // --- Game switch (GPU-only, zero unmount, zero fade!) ---
  const switchGameTo = useCallback(
    (nextGame: GameId) => {
      if (nextGame === game) return
      setIsMorphing(true)
      onChangeGame?.(nextGame)
      if (nextGame === 'pick') {
        dispatch({type: 'switch_game', to: 'pick'})
        setGame('pick')
        cardFlip.set(1)
        dragX.set(0)
        morph.set(
          withTiming(
            1,
            {
              duration: motionDuration(MOTION_DURATION.gameMorph, reduceMotion),
              easing: MOTION_EASING.standard,
            },
            () => {
              'worklet'
              runOnJS(setIsMorphing)(false)
            }
          )
        )
      } else {
        // Pick → Classic: ensure a Question is dealt if leaving from face-down Deck.
        if (!dealt) {
          dispatch({type: 'switch_game', to: 'wh'})
          cardFlip.set(1)
        } else if (phase === 'pick') {
          dispatch({type: 'switch_game', to: 'wh'})
          cardFlip.set(1)
        }
        dragX.set(0)
        const finish = () => {
          setGame('wh')
          setIsMorphing(false)
        }
        morph.set(
          withTiming(
            0,
            {
              duration: motionDuration(MOTION_DURATION.gameMorph, reduceMotion),
              easing: MOTION_EASING.standard,
            },
            () => {
              'worklet'
              runOnJS(finish)()
            }
          )
        )
      }
    },
    [game, onChangeGame, cardFlip, dragX, morph, reduceMotion, dealt, phase]
  )

  // Single choreography rule: every stage-affecting Settings change (Game, Language,
  // Second language, Tabletop, Card animation) applies once the Settings sheet clears.
  const handleSettingsClose = useCallback(
    (sheetGone = false) => {
      setSettingsModalOpen(false)
      const nextLanguage = pickedLanguageRef.current
      const nextGame = pickedGameRef.current
      pickedLanguageRef.current = undefined
      pickedGameRef.current = undefined
      if (sheetCloseTimerRef.current) clearTimeout(sheetCloseTimerRef.current)
      const apply = () => {
        sheetCloseTimerRef.current = null
        if (nextLanguage) setLanguage(nextLanguage)
        void readSettings(true)
        if (nextGame && nextGame !== game) switchGameTo(nextGame)
      }
      const wait = sheetGone ? 0 : motionDuration(SHEET_CLOSE_MS, reduceMotion)
      if (wait === 0) {
        apply()
        return
      }
      sheetCloseTimerRef.current = setTimeout(apply, wait)
    },
    [readSettings, game, switchGameTo, reduceMotion]
  )

  // Reset Classic flip/slide offsets synchronously BEFORE native paint once React commits
  // the new questionId, preventing both a 1-frame blank flash and Jest mock overwrite.
  useLayoutEffect(() => {
    classicFlip.set(0)
    classicSlideX.set(0)
  }, [questionId, idx, classicFlip, classicSlideX])

  // --- Classic navigation (continuous 0°→180° flip OR full-travel slide) ---
  const commitClassicNav = useCallback(
    (dir: 1 | -1) => {
      const action: NavAction =
        dir === 1 ? {type: 'next', cycle: upcomingCycle} : {type: 'previous'}
      lastNavActionRef.current = action
      viewTracker.endView(dir === 1 ? 'advanced' : 'previous')
      setClassicPeerDir(0)
      classicBusy.set(false)
      dispatch({type: 'classic_nav', action})
    },
    [viewTracker, upcomingCycle, classicBusy]
  )

  const releaseClassicStep = useCallback(() => {
    classicQueueRef.current = 0
    setClassicPeerDir(0)
    classicBusy.set(false)
  }, [classicBusy])

  const animateClassicStep = useCallback(
    (dir: 1 | -1, withHaptic = false) => {
      if (dir === -1 && isAtFirst) {
        classicQueueRef.current = 0
        return
      }
      if (classicBusy.get()) {
        const queued = classicQueueRef.current
        classicQueueRef.current = Math.sign(queued) === -dir ? 0 : queued + dir
        return
      }
      classicBusy.set(true)
      if (withHaptic) selection()
      setClassicPeerDir(dir)
      // A deep link mid-step resets the offsets and cancels this; committing then would skip past the linked Question.
      const finish = (finished?: boolean) => {
        'worklet'
        if (finished) runOnJS(commitClassicNav)(dir)
        else runOnJS(releaseClassicStep)()
      }
      if (turnsClassic) {
        const fullDur = reduceMotion
          ? MOTION_DURATION.fade
          : motionDuration(MOTION_DURATION.flip, false)
        const remaining = Math.max(0.25, 1 - Math.abs(classicFlip.get()))
        classicFlip.set(
          withTiming(
            dir,
            {duration: Math.round(fullDur * remaining), easing: MOTION_EASING.standard},
            finish
          )
        )
      } else {
        const fullDur = motionDuration(MOTION_DURATION.slide, reduceMotion)
        const remaining = Math.max(0.25, 1 - Math.abs(classicSlideX.get()) / Math.max(1, winWidth))
        classicSlideX.set(
          withTiming(
            -dir * winWidth,
            {duration: Math.round(fullDur * remaining), easing: MOTION_EASING.standard},
            finish
          )
        )
      }
    },
    [
      isAtFirst,
      turnsClassic,
      reduceMotion,
      classicFlip,
      classicSlideX,
      winWidth,
      commitClassicNav,
      releaseClassicStep,
      classicBusy,
    ]
  )

  // Run the next queued step once the committed Question is on screen.
  useLayoutEffect(() => {
    const queued = classicQueueRef.current
    if (!queued) return
    const dir = queued > 0 ? 1 : -1
    classicQueueRef.current = queued - dir
    animateClassicStep(dir)
  }, [idx, animateClassicStep])

  // --- Pick a Card navigation ---
  const pickOffscreen = winWidth + 60
  const pickDuration = useCallback(
    (ms: number) => (reduceMotion ? MOTION_DURATION.fade : motionDuration(ms, false)),
    [reduceMotion]
  )

  const handlePickCard = useCallback(() => {
    if (pickBusy.get()) return
    impact('medium')
    revealChrome()
    track({name: EVENTS.CARD_PICKED, props: {deck_id: deckSlug, game: GAMES.PICK}})
    pickBusy.set(true)
    flipSign.set(1)
    dragX.set(0)
    cardFlip.set(0)
    deckPeekSV.set(false)
    setDeckPeek(false)
    dispatch({type: 'pick_deal'})
    cardFlip.set(
      withTiming(
        1,
        {duration: pickDuration(MOTION_DURATION.flip), easing: MOTION_EASING.standard},
        () => {
          'worklet'
          pickBusy.set(false)
        }
      )
    )
  }, [deckSlug, revealChrome, dragX, cardFlip, pickDuration, pickBusy, flipSign, deckPeekSV])

  const releasePick = useCallback(() => {
    setHeldUnder(undefined)
    setHeldPrev(undefined)
    pickBusy.set(false)
  }, [pickBusy])

  // A Question and a Card move never land in the same frame: the Question (or phase) commits, the Card moves a frame later, then held faces let go.
  const pickAfterCommit = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    const move = pickAfterCommit.current
    if (!move) return
    pickAfterCommit.current = null
    requestAnimationFrame(move)
  }, [questionId, phase])

  const pickTurnUpAfterCommit = useCallback(
    (duration: number) => {
      pickAfterCommit.current = () =>
        cardFlip.set(
          withTiming(1, {duration, easing: MOTION_EASING.enter}, () => {
            'worklet'
            runOnJS(releasePick)()
          })
        )
    },
    [cardFlip, releasePick]
  )

  const commitPickNext = useCallback(
    (advanceSeen: boolean) => {
      viewTracker.endView('advanced')
      if (!advanceSeen) {
        // The Card stays off-screen until the Deck replaces it; the next deal re-centres it.
        pickBusy.set(false)
        dispatch({type: 'pick_put_down'})
        return
      }
      lastNavActionRef.current = {type: 'next'}
      setHeldUnder(nextQuestionId ?? null)
      if (slidesPick) {
        pickAfterCommit.current = () => {
          cardFlip.set(1)
          dragX.set(
            withTiming(0, {duration: 0}, () => {
              'worklet'
              runOnJS(releasePick)()
            })
          )
        }
      } else {
        pickTurnUpAfterCommit(Math.round(pickDuration(MOTION_DURATION.flip) / 2))
      }
      dispatch({type: 'pick_advance_seen'})
    },
    [
      viewTracker,
      pickBusy,
      nextQuestionId,
      slidesPick,
      cardFlip,
      dragX,
      releasePick,
      pickTurnUpAfterCommit,
      pickDuration,
    ]
  )

  const pickPutDown = useCallback(() => {
    if (pickBusy.get()) return
    pickBusy.set(true)
    flipSign.set(1)
    selection()
    const advanceSeen = hasSeenNext
    const done = () => {
      'worklet'
      runOnJS(commitPickNext)(advanceSeen)
    }
    if (slidesPick) {
      const fullDur = motionDuration(MOTION_DURATION.slide, reduceMotion)
      const remaining = Math.max(0.25, 1 - Math.abs(dragX.get()) / pickOffscreen)
      dragX.set(
        withTiming(
          -pickOffscreen,
          {duration: Math.round(fullDur * remaining), easing: MOTION_EASING.standard},
          done
        )
      )
    } else if (advanceSeen) {
      // Flip mode moving forward through already-seen Cards: turn edge-on, swap, turn face-up.
      const half = Math.round(pickDuration(MOTION_DURATION.flip) / 2)
      const remaining = Math.max(0.25, (cardFlip.get() - 0.5) / 0.5)
      cardFlip.set(
        withTiming(0.5, {duration: Math.round(half * remaining), easing: MOTION_EASING.exit}, done)
      )
    } else {
      const remaining = Math.max(0.25, cardFlip.get())
      cardFlip.set(
        withTiming(
          0,
          {
            duration: Math.round(pickDuration(MOTION_DURATION.flip) * remaining),
            easing: MOTION_EASING.standard,
          },
          done
        )
      )
    }
  }, [
    hasSeenNext,
    slidesPick,
    dragX,
    pickOffscreen,
    reduceMotion,
    cardFlip,
    commitPickNext,
    pickDuration,
    pickBusy,
    flipSign,
  ])

  const commitPickPrevious = useCallback(
    (slid: boolean) => {
      lastNavActionRef.current = {type: 'previous'}
      viewTracker.endView('previous')
      // The faces on screen keep their Questions until the Card has moved over or off them.
      setHeldUnder(hasSeenNext ? (nextQuestionId ?? null) : null)
      setHeldPrev(prevQuestionId)
      if (slid) {
        pickAfterCommit.current = () =>
          backIn.set(
            withTiming(0, {duration: 0}, () => {
              'worklet'
              runOnJS(releasePick)()
            })
          )
      } else {
        pickTurnUpAfterCommit(Math.round(pickDuration(MOTION_DURATION.pickBack) / 2))
      }
      dispatch({type: 'pick_previous'})
    },
    [
      viewTracker,
      hasSeenNext,
      nextQuestionId,
      prevQuestionId,
      backIn,
      releasePick,
      pickTurnUpAfterCommit,
      pickDuration,
    ]
  )

  const commitPickBackFromDeck = useCallback(() => {
    // The Deck hint stays faded until the Deck is hidden.
    pickAfterCommit.current = () => deckPeekSV.set(false)
    setDeckPeek(false)
    pickBusy.set(false)
    dispatch({type: 'pick_previous'})
  }, [deckPeekSV, pickBusy])

  const pickGoPrevious = useCallback(() => {
    revealChrome()
    if (pickBusy.get()) return
    const backDur = pickDuration(MOTION_DURATION.pickBack)
    if (phase === 'pick') {
      // Back on the Deck turns or slides the put-down Card back up; a drag has already started it.
      if (!dealt) return
      selection()
      pickBusy.set(true)
      flipSign.set(-1)
      const fromDrag = deckPeekSV.get()
      deckPeekSV.set(true)
      setDeckPeek(true)
      const land = () => {
        'worklet'
        runOnJS(commitPickBackFromDeck)()
      }
      if (slidesPick) {
        if (!fromDrag) {
          cardFlip.set(1)
          dragX.set(-pickOffscreen)
        }
        const remaining = Math.max(0.25, Math.abs(dragX.get()) / pickOffscreen)
        dragX.set(
          withTiming(
            0,
            {duration: Math.round(backDur * remaining), easing: MOTION_EASING.enter},
            land
          )
        )
      } else {
        if (!fromDrag) {
          dragX.set(0)
          cardFlip.set(0)
        }
        const remaining = Math.max(0.25, 1 - cardFlip.get())
        cardFlip.set(
          withTiming(
            1,
            {duration: Math.round(backDur * remaining), easing: MOTION_EASING.standard},
            land
          )
        )
      }
      return
    }
    if (isAtFirst || !prevQuestionId) return
    selection()
    pickBusy.set(true)
    flipSign.set(-1)
    if (slidesPick) {
      // The previous Card slides in from the left over the one it replaces.
      const duration = Math.round(backDur * Math.max(0.25, 1 - backIn.get()))
      dragX.set(withTiming(0, {duration, easing: MOTION_EASING.enter}))
      backIn.set(
        withTiming(1, {duration, easing: MOTION_EASING.enter}, () => {
          'worklet'
          runOnJS(commitPickPrevious)(true)
        })
      )
    } else {
      // Flip mode going back between already-seen Cards: turn edge-on, swap, turn face-up.
      const half = Math.round(backDur / 2)
      const remaining = Math.max(0.25, (cardFlip.get() - 0.5) / 0.5)
      cardFlip.set(
        withTiming(
          0.5,
          {duration: Math.round(half * remaining), easing: MOTION_EASING.exit},
          () => {
            'worklet'
            runOnJS(commitPickPrevious)(false)
          }
        )
      )
    }
  }, [
    revealChrome,
    phase,
    dealt,
    slidesPick,
    dragX,
    pickOffscreen,
    pickDuration,
    cardFlip,
    isAtFirst,
    prevQuestionId,
    commitPickPrevious,
    commitPickBackFromDeck,
    backIn,
    pickBusy,
    flipSign,
    deckPeekSV,
  ])

  const goNext = useCallback(() => {
    revealChrome()
    if (isPick) {
      if (phase === 'pick') handlePickCard()
      else pickPutDown()
      return
    }
    animateClassicStep(1, false)
  }, [revealChrome, isPick, phase, handlePickCard, pickPutDown, animateClassicStep])

  const goPrevious = useCallback(() => {
    revealChrome()
    if (isPick) {
      pickGoPrevious()
      return
    }
    animateClassicStep(-1, false)
  }, [revealChrome, isPick, pickGoPrevious, animateClassicStep])

  // Exact "?" right/bottom edge coordinates shared between Classic, Card, and PlayTransitionOverlay.
  const cardQRight = winWidth - (cardLeft + cardWidth) + CARD_Q_RIGHT
  const cardQBottom = winHeight - (cardTop + cardHeight) + CARD_Q_BOTTOM
  const classicQRight = CLASSIC_Q_RIGHT
  const classicQBottom = bottomBarH + CLASSIC_Q_BOTTOM

  const measuredDeckWordmark = useMemo(
    () =>
      wordmarkSize
        ? {
            x: cardLeft + cardWidth - 1 - 20 - wordmarkSize.width,
            y: cardTop + cardHeight - 1 - 20 - wordmarkSize.height,
            width: wordmarkSize.width,
            height: wordmarkSize.height,
          }
        : undefined,
    [cardLeft, cardWidth, cardTop, cardHeight, wordmarkSize]
  )

  useEffect(() => {
    // Until the bar and stage measure, bottomBarH is 0 and the overlay would aim its "?" off the bar.
    if (!bottomBarH || !box) return
    reportPlayTargetMetrics({
      bottomBarH,
      classicQ: {
        right: classicQRight,
        bottom: classicQBottom,
        scale: 1.08,
        width: qMarkSize?.width,
        height: qMarkSize?.height,
      },
      deckWordmark: measuredDeckWordmark,
    })
  }, [bottomBarH, box, classicQRight, classicQBottom, qMarkSize, measuredDeckWordmark])

  // Ensure Home's parting state & overlay always reset if Play unmounts via edge swipe / hardware back.
  useEffect(
    () => () => {
      if (exitNavTimerRef.current) clearTimeout(exitNavTimerRef.current)
      if (!exitingHomeRef.current) notifyReturnedHome()
    },
    []
  )

  const handleExit = useCallback(() => {
    if (exitingHomeRef.current) return
    void maybeRequestReview()
    const dur = motionDuration(MOTION_DURATION.homeToPlay, reduceMotion)
    const navigateBack = () => {
      if (router.canGoBack()) router.back()
      else router.replace('/')
    }
    if (dur === 0) {
      notifyReturnedHome()
      navigateBack()
      return
    }
    // Symmetric reverse of 5B: Question / Card / Deck drops cleanly off bottom while
    // "?" (or full WHO?CARDS wordmark from face-down Deck) glides back into Home's logo.
    exitingHomeRef.current = true
    setHomeExiting(true)
    const kind = isPick && phase === 'pick' ? 'deck' : 'qmark'
    const logoWidth = 280
    const logoHeight = Math.round((logoWidth * 226) / 1200)
    const playQAnchor = isPick
      ? {
          right: cardQRight,
          bottom: cardQBottom,
          scale: 1,
          width: qMarkSize?.width,
          height: qMarkSize?.height,
        }
      : {
          right: classicQRight,
          bottom: classicQBottom,
          scale: 1.08,
          width: qMarkSize?.width,
          height: qMarkSize?.height,
        }
    startExitTransition({
      kind,
      fallbackLogoRect: {
        x: (winWidth - logoWidth) / 2,
        y: winHeight * 0.36,
        width: logoWidth,
        height: logoHeight,
      },
      playQAnchor,
      deckWordmark: measuredDeckWordmark,
      bottomBarH,
    })
    homeRise.set(withTiming(1, {duration: Math.round(dur * 0.48), easing: MOTION_EASING.exit}))
    exitNavTimerRef.current = setTimeout(
      () => {
        notifyReturnedHome({kind, duration: Math.round(dur * 0.56)})
        navigateBack()
      },
      Math.round(dur * 0.44)
    )
  }, [
    maybeRequestReview,
    reduceMotion,
    router,
    isPick,
    phase,
    cardQRight,
    cardQBottom,
    classicQRight,
    classicQBottom,
    qMarkSize,
    measuredDeckWordmark,
    winWidth,
    winHeight,
    bottomBarH,
    homeRise,
  ])

  const handleShare = useCallback(() => {
    if (!text) return
    setShareModalOpen(true)
  }, [text])

  const handleShareEvent = useCallback(
    (name: ShareEventName, format: ShareFormat) => {
      track({
        name,
        props: {
          deck_id: deckSlug,
          question_id: questionId,
          language,
          game: analyticsGame,
          format,
        },
      })
    },
    [deckSlug, questionId, language, analyticsGame]
  )

  // --- Gestures ---
  const isAtFirstSV = useSharedValue(isAtFirst)
  useEffect(() => {
    isAtFirstSV.set(isAtFirst)
  }, [isAtFirst, isAtFirstSV])

  const turnsClassicSV = useSharedValue(turnsClassic)
  useEffect(() => {
    turnsClassicSV.set(turnsClassic)
  }, [turnsClassic, turnsClassicSV])

  const slidesPickSV = useSharedValue(slidesPick)
  useEffect(() => {
    slidesPickSV.set(slidesPick)
    if (slidesPick) return
    dragX.set(0)
    // A Flip-mode Deck keeps its put-down Card face-down, ready to turn back up.
    if (phase === 'pick') cardFlip.set(0)
  }, [slidesPick, slidesPickSV, dragX, phase, cardFlip])

  const hasSeenNextSV = useSharedValue(hasSeenNext)
  useEffect(() => {
    hasSeenNextSV.set(hasSeenNext)
  }, [hasSeenNext, hasSeenNextSV])

  useEffect(() => {
    if (classicPeerDir === 0) setPeerContentH(0)
  }, [classicPeerDir])

  const revealChromeStable = useCallback(() => revealChrome(), [revealChrome])
  const impactMediumOnJS = useCallback(() => impact('medium'), [])
  const setPeerDirOnJS = useCallback((dir: -1 | 0 | 1) => setClassicPeerDir(dir), [])
  const commitClassicNext = useCallback(() => animateClassicStep(1, true), [animateClassicStep])
  const commitClassicPrev = useCallback(() => animateClassicStep(-1, true), [animateClassicStep])

  const classicGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .withTestId('question-pan')
      .onBegin(() => {
        'worklet'
        runOnJS(revealChromeStable)()
      })
      .onUpdate((event) => {
        'worklet'
        // Mid-step the running animation owns the Card; the swipe still counts on release.
        if (classicBusy.get()) return
        // Nothing comes before the first Card, so a Back drag there doesn't move it.
        const tx = event.translationX > 0 && isAtFirstSV.get() ? 0 : event.translationX
        const dir: -1 | 0 | 1 = tx < -4 ? 1 : tx > 4 ? -1 : 0
        runOnJS(setPeerDirOnJS)(dir)
        if (turnsClassicSV.get()) {
          classicFlip.set(Math.max(-1, Math.min(1, -tx / TURN_DRAG)))
        } else {
          classicSlideX.set(tx)
        }
      })
      .onEnd((event) => {
        'worklet'
        const tx = event.translationX
        const vx = event.velocityX
        const next = tx <= -SWIPE_THRESHOLD || vx < -500
        const previous = (tx >= SWIPE_THRESHOLD || vx > 500) && !isAtFirstSV.get()
        if (classicBusy.get()) {
          if (next || previous) runOnJS(next ? commitClassicNext : commitClassicPrev)()
          return
        }
        if (!next && !previous) {
          classicSlideX.set(withSpring(0, {damping: 20, stiffness: 300}))
          classicFlip.set(
            withTiming(0, {duration: 180}, () => {
              'worklet'
              runOnJS(setPeerDirOnJS)(0)
            })
          )
          return
        }
        runOnJS(impactMediumOnJS)()
        runOnJS(next ? commitClassicNext : commitClassicPrev)()
      })

    const tap = Gesture.Tap()
      .withTestId('question-tap')
      .onStart((event) => {
        'worklet'
        if (event.y > winHeight - bottomBarH) runOnJS(revealChromeStable)()
        else runOnJS(goNext)()
      })

    return Gesture.Race(tap, pan)
  }, [
    revealChromeStable,
    isAtFirstSV,
    classicBusy,
    setPeerDirOnJS,
    turnsClassicSV,
    classicFlip,
    classicSlideX,
    impactMediumOnJS,
    commitClassicNext,
    commitClassicPrev,
    winHeight,
    bottomBarH,
    goNext,
  ])

  const swipeAwayPick = useCallback(() => {
    impact('medium')
    revealChrome()
    pickPutDown()
  }, [revealChrome, pickPutDown])

  const pickCardTap = useMemo(
    () =>
      Gesture.Tap().onStart(() => {
        'worklet'
        runOnJS(goNext)()
      }),
    [goNext]
  )

  const pickGesture = useMemo(() => {
    const tap = Gesture.Tap().onStart(() => {
      'worklet'
      runOnJS(revealChromeStable)()
    })
    const pan = Gesture.Pan()
      .withTestId('card-pan')
      .onUpdate((event) => {
        'worklet'
        if (pickBusy.get()) return
        const slides = slidesPickSV.get()
        if (!onCard) {
          // Face-down Deck: a right drag brings the put-down Card back with the finger.
          const back = Math.max(0, event.translationX)
          if (!dealt || (back === 0 && !deckPeekSV.get())) return
          if (!deckPeekSV.get()) {
            deckPeekSV.set(true)
            flipSign.set(-1)
            if (slides) cardFlip.set(1)
            else dragX.set(0)
            runOnJS(setDeckPeek)(true)
          }
          if (slides) dragX.set(Math.min(0, back - pickOffscreen))
          else cardFlip.set(Math.min(1, back / FLIP_DRAG))
          return
        }
        // Nothing comes before the first Card, so a Back drag there doesn't move it.
        const tx = event.translationX > 0 && isAtFirstSV.get() ? 0 : event.translationX
        if (slides) {
          // Back brings the previous Card over this one, so this one only gives a little.
          dragX.set(tx > 0 ? tx * 0.25 : tx)
          backIn.set(Math.min(1, Math.max(0, tx) / pickOffscreen))
        } else {
          if (tx !== 0) flipSign.set(tx < 0 ? 1 : -1)
          // Back and Next to a seen Card turn only to edge-on; the Question swaps there on release.
          const minFlip = tx > 0 || hasSeenNextSV.get() ? 0.5 : 0
          cardFlip.set(Math.max(minFlip, 1 - Math.min(Math.abs(tx) / FLIP_DRAG, 1)))
        }
      })
      .onEnd((event) => {
        'worklet'
        if (pickBusy.get()) return
        const tx = event.translationX
        const swiped = Math.abs(tx) >= SWIPE_THRESHOLD || Math.abs(event.velocityX) > 500
        const back = (tx || event.velocityX) > 0
        // Face-down Deck: a swipe does what the bar's Next / Back do.
        if (!onCard) {
          if (swiped) {
            runOnJS(back ? goPrevious : goNext)()
          } else if (deckPeekSV.get()) {
            pickBusy.set(true)
            const endPeek = () => {
              'worklet'
              deckPeekSV.set(false)
              pickBusy.set(false)
              runOnJS(setDeckPeek)(false)
            }
            if (slidesPickSV.get()) dragX.set(withTiming(-pickOffscreen, {duration: 150}, endPeek))
            else cardFlip.set(withTiming(0, {duration: 150}, endPeek))
          }
          return
        }
        if (swiped && !back) {
          runOnJS(swipeAwayPick)()
          return
        }
        if (swiped && back && !isAtFirstSV.get()) {
          runOnJS(goPrevious)()
          return
        }
        cardFlip.set(withTiming(1, {duration: 150}))
        dragX.set(withTiming(0, {duration: 150}))
        backIn.set(withTiming(0, {duration: 150}))
      })
    return Gesture.Race(tap, pan)
  }, [
    revealChromeStable,
    onCard,
    dealt,
    pickOffscreen,
    backIn,
    deckPeekSV,
    slidesPickSV,
    hasSeenNextSV,
    dragX,
    cardFlip,
    swipeAwayPick,
    goNext,
    goPrevious,
    isAtFirstSV,
    pickBusy,
    flipSign,
  ])

  // --- Animated Styles (100% GPU transforms + opacity, zero layout thrash) ---
  // Smoothly cross-blend Dark mode's mid-tone table (#332b4a) over the darkest canvas (#08001a)
  // across both Classic ↔ Pick a Card (`morph`) and Home ↔ Pick a Card (`homeRise`).
  const tableBgStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(morph.get(), [0, 0.85], [0, 1], 'clamp') *
      interpolate(homeRise.get(), [0, 0.85], [1, 0], 'clamp'),
  }))

  const cardShellStyle = useAnimatedStyle(() => {
    const p = morph.get()
    const sx = interpolate(p, [0, 1], [winWidth / Math.max(1, cardWidth), 1], 'clamp')
    const sy = interpolate(p, [0, 1], [winHeight / Math.max(1, cardHeight), 1], 'clamp')
    const ty = interpolate(p, [0, 1], [winHeight / 2 - (cardTop + cardHeight / 2), 0], 'clamp')
    return {
      borderRadius: p * 20,
      transform: [{translateY: ty}, {scaleX: sx}, {scaleY: sy}],
    }
  })

  const classicCoverStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.get(), [0.18, 0.68], [1, 0], 'clamp'),
  }))

  const cardBorderStyle = useAnimatedStyle(() => ({
    borderRadius: morph.get() * 20,
    opacity: interpolate(morph.get(), [0.22, 0.68], [0, 1], 'clamp'),
  }))

  const deckLayersStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.get(), [0.42, 0.9], [0, 1], 'clamp'),
  }))

  // Yoga centers the text in a card-inner box, so Classic's translateY never depends on its height.
  const classicCenterY = insets.top + measured.height / 2
  const classicDy = classicCenterY - (cardTop + CARD_PADDING_Y + cardInner.height / 2)
  const peerQuestionId = classicPeerDir === 1 ? nextQuestionId : prevQuestionId

  const primaryTextTransformStyle = useAnimatedStyle(() => {
    const p = morph.get()
    const t = classicFlip.get()
    const sx = classicSlideX.get()
    const rise = interpolate(homeRise.get(), [0, 1], [0, winHeight * 0.62], 'clamp')
    const morphTy = interpolate(p, [0, 1], [classicDy, 0], 'clamp') + rise
    const morphScale = interpolate(p, [0, 1], [classicScale, 1], 'clamp')

    if (reduceMotion) {
      const flipOpacity = Math.max(0, 1 - Math.abs(t) * 2)
      return {
        opacity: flipOpacity,
        transform: [{translateX: sx}, {translateY: morphTy}, {scale: morphScale}],
      }
    }
    const visible = Math.abs(t) < 0.5 ? 1 : 0
    return {
      opacity: visible,
      transform: [
        {perspective: 1000},
        {translateX: sx},
        {translateY: morphTy},
        {rotateY: `${t * 180}deg`},
        {scale: morphScale},
      ],
    }
  })

  const peerTextTransformStyle = useAnimatedStyle(() => {
    const t = classicFlip.get()
    const sx = classicSlideX.get()
    if (reduceMotion) {
      const flipOpacity = Math.max(0, (Math.abs(t) - 0.5) * 2)
      return {
        opacity: flipOpacity,
        transform: [{translateY: classicDy}, {scale: classicScale}],
      }
    }
    const isFlipping = Math.abs(t) > 0.001
    if (isFlipping) {
      const visible = Math.abs(t) >= 0.5 ? 1 : 0
      const deg = t > 0 ? (t - 1) * 180 : (t + 1) * 180
      return {
        opacity: visible,
        transform: [
          {perspective: 1000},
          {translateY: classicDy},
          {rotateY: `${deg}deg`},
          {scale: classicScale},
        ],
      }
    }
    // Side from the slide's sign, not React state, which lags a frame behind the peer's mount.
    return {
      opacity: 1,
      transform: [
        {translateX: sx > 0 ? sx - winWidth : sx + winWidth},
        {translateY: classicDy},
        {scale: classicScale},
      ],
    }
  })

  // Mid-flip vertical bar OUTSIDE rotateY so it stays crisp at 90°:
  // - 1 language (2A): exact max(outgoing, incoming) text height.
  // - 2 languages / Tabletop (2B): compact 84px mid-violet bar where the horizontal divider shrinks in.
  const spineHeight = isSplit
    ? 84
    : Math.max(48, Math.round(Math.max(currContentH, peerContentH) * classicScale))
  const classicSpineStyle = useAnimatedStyle(() => ({
    opacity: flipMid.get(),
    transform: [{scaleY: interpolate(flipMid.get(), [0, 1], [isSplit ? 0.1 : 0.85, 1], 'clamp')}],
  }))

  // ONE continuous "?" gliding between Classic bottom-right and Card bottom-right.
  // Anchored by exact right/bottom edges and hidden via transitionActiveSV during Home↔Play
  // so PlayTransitionOverlay hands off atomically at 0.0px offset.
  const sharedQMarkStyle = useAnimatedStyle(() => {
    const p = morph.get()
    const hidden = transitionActiveSV.get() > 0.5
    return {
      opacity: hidden ? 0 : 1,
      transform: [
        {translateX: interpolate(p, [0, 1], [cardQRight - classicQRight, 0], 'clamp')},
        {translateY: interpolate(p, [0, 1], [cardQBottom - classicQBottom, 0], 'clamp')},
        {scale: interpolate(p, [0, 1], [1.08, 1], 'clamp')},
      ],
    }
  })

  // Pick a Card interactive card animations (flip, drag-slide, under-card lift, 4B slide-back).
  const pickWrapperStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {}
    const tx = slidesPickSV.get() ? dragX.get() : 0
    const tilt = slidesPickSV.get()
      ? interpolate(tx, [-winWidth, 0, winWidth], [-11, 0, 11], 'clamp')
      : 0
    return {
      transform: [
        {translateX: tx},
        {rotate: `${tilt}deg`},
        {translateY: interpolate(cardFlip.get(), [0, 0.5, 1], [0, -16, 0], 'clamp')},
        {scale: interpolate(cardFlip.get(), [0, 0.5, 1], [1, 1.04, 1], 'clamp')},
      ],
    }
  })

  const pickPrevCardStyle = useAnimatedStyle(() => {
    const tx = -pickOffscreen * (1 - backIn.get())
    return {
      transform: [
        {translateX: tx},
        {rotate: `${interpolate(tx, [-winWidth, 0], [-11, 0], 'clamp')}deg`},
      ],
    }
  })

  // The Deck's "Tap to pick" hint fades out as its put-down Card comes back over the Deck.
  const deckHintStyle = useAnimatedStyle(() => {
    if (!deckPeekSV.get()) return {opacity: 1}
    const back = slidesPickSV.get() ? 1 + dragX.get() / pickOffscreen : cardFlip.get()
    return {opacity: 1 - Math.min(1, Math.max(0, back))}
  })

  const pickUnderCardStyle = useAnimatedStyle(() => {
    const absDrag = Math.abs(dragX.get())
    const s = interpolate(absDrag, [0, winWidth * 0.7], [0.96, 1], 'clamp')
    return {transform: [{scale: s}]}
  })

  const pickBackFaceStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {opacity: 1 - cardFlip.get()}
      : {
          transform: [
            {perspective: 1000},
            {
              rotateY: `${flipSign.get() * interpolate(cardFlip.get(), [0, 1], [0, 180], 'clamp')}deg`,
            },
          ],
          backfaceVisibility: 'hidden' as const,
        }
  )

  const pickFrontFaceStyle = useAnimatedStyle(() =>
    reduceMotion
      ? {opacity: cardFlip.get()}
      : {
          transform: [
            {perspective: 1000},
            {
              rotateY: `${flipSign.get() * interpolate(cardFlip.get(), [0, 1], [180, 360], 'clamp')}deg`,
            },
          ],
          backfaceVisibility: 'hidden' as const,
        }
  )

  // A face-up Card already seen, under the open one or sliding back over it.
  const seenFace = (id: string) => (
    <View className="bg-darker absolute inset-0 overflow-hidden rounded-[20px]">
      <CardFaceLinen />
      <Text
        className="text-primary-dark font-title"
        style={{
          position: 'absolute',
          bottom: CARD_Q_BOTTOM,
          right: CARD_Q_RIGHT,
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
          questionKey={id}
          text={textOf(id)}
          language={language}
          box={cardInner}
          secondaries={secondariesOf(id)}
          mirrored={tabletop}
        />
      </View>
      <CardEdge />
    </View>
  )
  const underFaceId = heldUnder !== undefined ? heldUnder : hasSeenNext ? nextQuestionId : null
  const prevFaceId = phase === 'card' ? (heldPrev ?? prevQuestionId) : undefined

  // Both stages stay mounted in Pick a Card and swap visibility, so neither's Card texture decodes on screen.
  const morphHidden = isPick && !isMorphing

  return (
    <ScreenBackground>
      <View className="flex-1">
        {/* Table canvas underneath Pick a Card (always mounted — zero decode delay). */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tableBgStyle]}>
          <ScreenBackground table>{null}</ScreenBackground>
        </Animated.View>

        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* Layout box measurer matching both Games' exact chrome padding. */}
        <View
          pointerEvents="none"
          className="absolute inset-0 px-8"
          style={{paddingTop: insets.top, paddingBottom: bottomBarH}}
        >
          <View className="flex-1" onLayout={onBoxLayout} />
        </View>

        {/* --- MODE 1: Classic OR Active Game-Switch Morph (one single QuestionText, zero fade!) --- */}
        <GestureDetector gesture={classicGesture}>
          <View
            className="flex-1"
            pointerEvents={morphHidden ? 'none' : 'auto'}
            accessibilityElementsHidden={morphHidden}
            importantForAccessibility={morphHidden ? 'no-hide-descendants' : 'auto'}
            style={morphHidden ? {opacity: 0} : undefined}
          >
            {/* Under-deck layers & morphing Card shell — only mounted during Game switch or Pick so Classic has zero extra layers. */}
            {isMorphing || isPick ? (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: 'absolute',
                      left: cardLeft,
                      top: cardTop,
                      width: cardWidth,
                      height: cardHeight,
                    },
                    deckLayersStyle,
                  ]}
                >
                  {DECK_LAYERS.map(({rotate, translateY}) => (
                    <View
                      key={rotate}
                      style={{transform: [{rotate}, {translateY}]}}
                      className="bg-dark/80 absolute inset-0 rounded-[20px] border border-white/10"
                    />
                  ))}
                </Animated.View>

                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: 'absolute',
                      left: cardLeft,
                      top: cardTop,
                      width: cardWidth,
                      height: cardHeight,
                      overflow: 'hidden',
                    },
                    cardShellStyle,
                  ]}
                >
                  <View className="bg-darker absolute inset-0">
                    <CardFaceLinen />
                  </View>
                  <Animated.View style={[StyleSheet.absoluteFill, classicCoverStyle]}>
                    <ScreenBackground>{null}</ScreenBackground>
                  </Animated.View>
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'},
                      cardBorderStyle,
                    ]}
                  />
                </Animated.View>
              </>
            ) : null}

            {/* 2A / 2B: Quiet mid-violet vertical bar at 90° during Classic flip (outside rotateY & elevated in Z). */}
            {classicPeerDir !== 0 && turnsClassic && !reduceMotion ? (
              <Animated.View
                pointerEvents="none"
                className="items-center justify-center"
                style={[
                  {
                    position: 'absolute',
                    left: winWidth / 2 - 2,
                    top: classicCenterY - spineHeight / 2,
                    width: 4,
                    height: spineHeight,
                    zIndex: 510,
                  },
                  classicSpineStyle,
                ]}
              >
                <View className="bg-primary-dark/25 absolute h-full w-full rounded-full" />
                <View
                  className="bg-primary-dark/55 absolute w-full rounded-full"
                  style={{height: Math.round(spineHeight * 0.62)}}
                />
                <View
                  className="bg-primary-dark/80 absolute w-full rounded-full"
                  style={{height: Math.round(spineHeight * 0.28)}}
                />
              </Animated.View>
            ) : null}

            {/* ONE single active QuestionText — stays on screen through Game switch! Elevated zIndex prevents 3D rotateY from intersecting the z=0 canvas on iOS. */}
            {languageReady ? (
              <Animated.View
                pointerEvents="box-none"
                style={[
                  {
                    position: 'absolute',
                    left: cardLeft + CARD_PADDING_X,
                    top: cardTop + CARD_PADDING_Y,
                    width: cardInner.width,
                    height: cardInner.height,
                    zIndex: 500,
                  },
                  primaryTextTransformStyle,
                ]}
              >
                <QuestionText
                  themedText
                  verticalCenter={classicCentering}
                  questionKey={questionId}
                  cardAnimation={cardAnimation}
                  morphColor={morph}
                  flipMid={flipMid}
                  text={text}
                  language={language}
                  box={cardInner}
                  secondaries={activeSecondaries}
                  mirrored={tabletop}
                  onContentHeight={setCurrContentH}
                />
              </Animated.View>
            ) : null}

            {/* Live incoming neighbor face during Classic flip (>90°) or full slide. */}
            {languageReady && classicPeerDir !== 0 && peerQuestionId ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    left: cardLeft + CARD_PADDING_X,
                    top: cardTop + CARD_PADDING_Y,
                    width: cardInner.width,
                    height: cardInner.height,
                    justifyContent: 'center',
                    zIndex: 500,
                  },
                  peerTextTransformStyle,
                ]}
              >
                <QuestionText
                  themedText
                  questionKey={peerQuestionId}
                  flipMid={isSplit ? flipMid : undefined}
                  text={textOf(peerQuestionId)}
                  language={language}
                  box={cardInner}
                  secondaries={secondariesOf(peerQuestionId)}
                  mirrored={tabletop}
                  onContentHeight={setPeerContentH}
                />
              </Animated.View>
            ) : null}

            {/* ONE continuous "?" mark gliding between Classic corner and Card corner.
                  Always mounted so onLayout measures exact native bounds on frame 0;
                  sharedQMarkStyle sets opacity: 0 while PlayTransitionOverlay is active. */}
            <Animated.Text
              pointerEvents="none"
              onLayout={onQMarkLayout}
              className="text-primary-dark font-title"
              style={[
                {
                  position: 'absolute',
                  right: cardQRight,
                  bottom: cardQBottom,
                  fontSize: QUESTION_MARK_SIZE,
                  lineHeight: QUESTION_MARK_LINE_HEIGHT,
                  zIndex: 520,
                },
                sharedQMarkStyle,
              ]}
            >
              ?
            </Animated.Text>
          </View>
        </GestureDetector>

        {/* --- MODE 2: Pick a Card Interactive Stage (shown once morph = 1) --- */}
        {isPick ? (
          <GestureDetector gesture={pickGesture}>
            <View
              testID="pick-stage"
              className="absolute inset-0 px-8"
              pointerEvents={isMorphing ? 'none' : 'auto'}
              accessibilityElementsHidden={isMorphing}
              importantForAccessibility={isMorphing ? 'no-hide-descendants' : 'auto'}
              style={{
                paddingTop: insets.top,
                paddingBottom: bottomBarH,
                opacity: isMorphing ? 0 : 1,
              }}
            >
              {/* Card and Deck both stay mounted and swap visibility: a Card texture mounted mid-move paints a frame late. */}
              <View className="flex-1">
                {!languageReady ? null : (
                  <View
                    className="absolute inset-0 items-center justify-center"
                    pointerEvents={phase === 'card' ? 'box-none' : 'none'}
                    accessibilityElementsHidden={phase !== 'card'}
                    importantForAccessibility={phase === 'card' ? 'auto' : 'no-hide-descendants'}
                    style={{opacity: phase === 'card' || deckPeek ? 1 : 0}}
                  >
                    <Animated.View className="items-center" style={homeRiseStyle}>
                      <GestureDetector gesture={pickCardTap}>
                        <View style={{width: cardWidth, height: cardHeight}}>
                          {/* Deck under-layers */}
                          <View className="absolute inset-0" pointerEvents="none">
                            {DECK_LAYERS.map(({rotate, translateY}) => (
                              <View
                                key={rotate}
                                style={{transform: [{rotate}, {translateY}]}}
                                className="bg-dark/80 absolute inset-0 rounded-[20px] border border-white/10"
                              />
                            ))}
                          </View>

                          {/* Real colorful CardBack (or next already-seen Card face!) directly underneath when sliding. */}
                          <Animated.View
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={[StyleSheet.absoluteFill, pickUnderCardStyle]}
                          >
                            {underFaceId ? seenFace(underFaceId) : <CardBack />}
                          </Animated.View>

                          {/* Active revealed Card — elevated zIndex prevents 3D flip from intersecting the Deck beneath. */}
                          <Animated.View
                            style={[{zIndex: 300}, pickWrapperStyle]}
                            className="absolute inset-0"
                          >
                            <Animated.View style={pickBackFaceStyle} className="absolute inset-0">
                              <CardBack />
                            </Animated.View>
                            <Animated.View
                              style={pickFrontFaceStyle}
                              className="bg-darker absolute inset-0 overflow-hidden rounded-[20px]"
                            >
                              <CardFaceLinen />
                              {!homeExiting ? (
                                <Text
                                  className="text-primary-dark font-title"
                                  style={{
                                    position: 'absolute',
                                    bottom: CARD_Q_BOTTOM,
                                    right: CARD_Q_RIGHT,
                                    fontSize: QUESTION_MARK_SIZE,
                                    lineHeight: QUESTION_MARK_LINE_HEIGHT,
                                  }}
                                >
                                  ?
                                </Text>
                              ) : null}
                              <View
                                className="flex-1 justify-start"
                                style={{
                                  paddingHorizontal: CARD_PADDING_X,
                                  paddingVertical: CARD_PADDING_Y,
                                }}
                              >
                                <QuestionText
                                  questionKey={questionId}
                                  cardAnimation={cardAnimation}
                                  text={text}
                                  language={language}
                                  box={cardInner}
                                  secondaries={activeSecondaries}
                                  mirrored={tabletop}
                                />
                              </View>
                              <CardEdge />
                            </Animated.View>
                          </Animated.View>

                          {prevFaceId ? (
                            <Animated.View
                              pointerEvents="none"
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                              style={[StyleSheet.absoluteFill, {zIndex: 301}, pickPrevCardStyle]}
                            >
                              {seenFace(prevFaceId)}
                            </Animated.View>
                          ) : null}
                        </View>
                      </GestureDetector>
                      <View style={{height: HINT_SPACE, marginTop: HINT_GAP}} />
                    </Animated.View>
                  </View>
                )}
                <View
                  className="absolute inset-0 items-center justify-center"
                  pointerEvents={phase === 'pick' ? 'box-none' : 'none'}
                  accessibilityElementsHidden={phase !== 'pick'}
                  importantForAccessibility={phase === 'pick' ? 'auto' : 'no-hide-descendants'}
                  style={{opacity: phase === 'pick' ? 1 : 0}}
                >
                  <Animated.View className="items-center" style={homeRiseStyle}>
                    <View
                      style={{
                        width: cardWidth,
                        height: cardHeight,
                        opacity: deckTextureReady && !deckPeek ? undefined : 0,
                      }}
                    >
                      {DECK_LAYERS.map(({rotate, translateY}) => (
                        <View
                          key={rotate}
                          style={{transform: [{rotate}, {translateY}]}}
                          className="bg-dark/80 absolute inset-0 rounded-[20px] border border-white/10"
                        />
                      ))}
                      <PressableScale
                        onPress={handlePickCard}
                        accessibilityRole="button"
                        accessibilityLabel={copy('a11y.pickACard')}
                        className="absolute inset-0"
                      >
                        <CardBack
                          hideWordmark={transitionActive || homeExiting}
                          onWordmarkLayout={onWordmarkLayout}
                          onTextureLoad={onDeckTextureLoad}
                        />
                      </PressableScale>
                    </View>
                    <Pressable
                      onPress={handlePickCard}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={copy('pick.tapToPick')}
                      style={{height: HINT_SPACE, marginTop: HINT_GAP}}
                      className="justify-center"
                    >
                      <Animated.Text
                        className="text-mutedOnLight dark:text-gray-dark font-sans text-sm"
                        style={deckHintStyle}
                      >
                        {copy('pick.tapToPick')}
                      </Animated.Text>
                    </Pressable>
                  </Animated.View>
                </View>
              </View>
            </View>
          </GestureDetector>
        ) : null}

        {/* Single mounted bottom action bar — never remounts on Game switch. */}
        <Animated.View
          pointerEvents={chromeShown ? 'box-none' : 'none'}
          onLayout={onBottomBarLayout}
          className="absolute inset-x-0 bottom-0"
          style={[{zIndex: 600}, bottomChromeStyle]}
        >
          <Animated.View style={barSlideStyle}>
            <PlayerBar
              shareDisabled={!onCard || !text}
              previousDisabled={isPick && phase === 'pick' ? !dealt : isAtFirst}
              onPrevious={goPrevious}
              onNext={goNext}
              onShare={handleShare}
              onSettings={() => setSettingsModalOpen(true)}
              onExit={handleExit}
            />
          </Animated.View>
        </Animated.View>

        <ShareModal
          visible={shareModalOpen}
          questionText={text}
          shareUrl={buildShareUrl(deckSlug, language, questionId)}
          storyImageUrl={poolBacked ? buildShareCardUrl('story', language, questionId) : undefined}
          postImageUrl={poolBacked ? buildShareCardUrl('post', language, questionId) : undefined}
          onShareEvent={handleShareEvent}
          onClose={() => setShareModalOpen(false)}
        />

        <SettingsModal
          visible={settingsModalOpen}
          onClose={handleSettingsClose}
          deckSlug={deckSlug}
          languages={languages}
          currentGame={game}
          onSelectGame={(next) => {
            pickedGameRef.current = next
          }}
          currentLanguage={language}
          onSelectLanguage={(next) => {
            pickedLanguageRef.current = next
          }}
          theme={theme}
          onSelectTheme={selectTheme}
          alignTo={isPick ? {left: cardLeft, right: cardLeft + cardWidth} : undefined}
        />
      </View>
    </ScreenBackground>
  )
}
