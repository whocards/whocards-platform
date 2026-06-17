import {useLocalSearchParams, useRouter} from 'expo-router'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import {Animated, Text, View} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {QuestionSet} from '@whocards/decks'
import {getDeck, getDirection, getInitialNav, navReducer} from '@whocards/decks'

import {LanguageModal} from '@/components/language-modal'
import {PlayerControls} from '@/components/player-controls'
import {ScreenBackground} from '@/components/screen-background'

const SWIPE_THRESHOLD = 60
const CONTROLS_HIDE_MS = 3000

export default function PlayScreen() {
  const {deck: slug} = useLocalSearchParams<{deck: string}>()
  const deck = getDeck(slug)

  if (!deck) {
    return (
      <ScreenBackground>
        <SafeAreaView className="flex-1 items-center justify-center">
          <Text className="text-white">Deck not found.</Text>
        </SafeAreaView>
      </ScreenBackground>
    )
  }

  return (
    <DeckPlayer
      questionIds={deck.questionIds}
      questions={deck.questions}
      languages={deck.languages}
    />
  )
}

type DeckPlayerProps = {
  questionIds: string[]
  questions: QuestionSet
  languages: string[]
}

const DeckPlayer = ({questionIds, questions, languages}: DeckPlayerProps) => {
  const router = useRouter()

  // the shared headless engine — identical behaviour to the web <Play> (ADR-0003)
  const reducer = useMemo(() => navReducer(questionIds), [questionIds])
  const [{ids, idx}, dispatch] = useReducer(reducer, undefined, () => getInitialNav(questionIds))
  const defaultLanguage = languages[0]
  const [language, setLanguage] = useState(defaultLanguage)
  const [langModalOpen, setLangModalOpen] = useState(false)

  const questionId = ids[idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''
  const direction = getDirection(language)

  // --- auto-hiding controls: hide after inactivity, reveal on any touch (mirrors web) ---
  const controlsOpacity = useRef(new Animated.Value(1)).current
  const [controlsShown, setControlsShown] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fade = useCallback(
    (to: number) => {
      setControlsShown(to === 1)
      Animated.timing(controlsOpacity, {toValue: to, duration: 300, useNativeDriver: true}).start()
    },
    [controlsOpacity]
  )

  const revealControls = useCallback(() => {
    fade(1)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => fade(0), CONTROLS_HIDE_MS)
  }, [fade])

  useEffect(() => {
    revealControls()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealControls])

  // --- subtle slide+fade as the question changes (direction follows next/prev) ---
  const enter = useRef(new Animated.Value(0)).current
  const navDir = useRef(1)

  useEffect(() => {
    enter.setValue(navDir.current)
    Animated.timing(enter, {toValue: 0, duration: 260, useNativeDriver: true}).start()
  }, [questionId, enter])

  const cardStyle = {
    opacity: enter.interpolate({inputRange: [-1, 0, 1], outputRange: [0, 1, 0]}),
    transform: [
      {translateX: enter.interpolate({inputRange: [-1, 0, 1], outputRange: [-28, 0, 28]})},
    ],
  }

  const goNext = useCallback(() => {
    navDir.current = 1
    revealControls()
    dispatch({type: 'next'})
  }, [revealControls])

  // the reducer clamps `previous` at the first card, so no idx guard is needed here
  const goPrevious = useCallback(() => {
    navDir.current = -1
    revealControls()
    dispatch({type: 'previous'})
  }, [revealControls])

  // leave the player — back to wherever we came from, falling back to the library
  const handleExit = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])

  const openLanguage = useCallback(() => {
    revealControls()
    setLangModalOpen(true)
  }, [revealControls])

  // --- swipe to navigate (runs on the JS thread so it can dispatch directly) ---
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(revealControls)
      .onEnd((event) => {
        if (event.translationX <= -SWIPE_THRESHOLD) goNext()
        else if (event.translationX >= SWIPE_THRESHOLD) goPrevious()
      })
    const tap = Gesture.Tap().runOnJS(true).onStart(revealControls)
    return Gesture.Race(tap, pan)
  }, [revealControls, goNext, goPrevious])

  return (
    <ScreenBackground>
      <View className="flex-1">
        <GestureDetector gesture={gesture}>
          <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 justify-center px-6">
            <Animated.View style={cardStyle}>
              <Text
                className="text-3xl font-semibold leading-snug text-white"
                style={{writingDirection: direction}}
              >
                {text}
              </Text>
            </Animated.View>
          </SafeAreaView>
        </GestureDetector>

        {/* Animated.View carries only the opacity; PlayerControls owns the bar layout */}
        <Animated.View
          style={{opacity: controlsOpacity, pointerEvents: controlsShown ? 'auto' : 'none'}}
        >
          <PlayerControls
            language={language}
            showLanguage={languages.length > 1}
            canPrevious={idx > 0}
            onPrevious={goPrevious}
            onNext={goNext}
            onLanguage={openLanguage}
            onExit={handleExit}
          />
        </Animated.View>

        <LanguageModal
          visible={langModalOpen}
          languages={languages}
          current={language}
          onSelect={(next) => {
            setLanguage(next)
            setLangModalOpen(false)
            revealControls()
          }}
          onClose={() => setLangModalOpen(false)}
        />
      </View>
    </ScreenBackground>
  )
}
