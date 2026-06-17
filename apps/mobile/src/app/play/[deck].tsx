import {Ionicons} from '@expo/vector-icons'
import {useLocalSearchParams, useRouter} from 'expo-router'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import type {LayoutChangeEvent} from 'react-native'
import {Animated, Pressable, Text, useWindowDimensions, View} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {QuestionSet} from '@whocards/decks'
import {getDeck, getDirection, getInitialNav, navReducer} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {LanguageModal} from '@/components/language-modal'
import {ScreenBackground} from '@/components/screen-background'

const SWIPE_THRESHOLD = 60
const HINT_HIDE_MS = 4500

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
  const total = ids.length
  const position = idx + 1

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

  // --- the swipe hint fades out once you start playing (or after a few idle seconds) ---
  const hintOpacity = useRef(new Animated.Value(1)).current
  const hideHint = useCallback(() => {
    Animated.timing(hintOpacity, {toValue: 0, duration: 400, useNativeDriver: true}).start()
  }, [hintOpacity])

  useEffect(() => {
    const timer = setTimeout(hideHint, HINT_HIDE_MS)
    return () => clearTimeout(timer)
  }, [hideHint])

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
    hideHint()
    dispatch({type: 'next'})
  }, [hideHint])

  // the reducer clamps `previous` at the first card, so no idx guard is needed here
  const goPrevious = useCallback(() => {
    navDir.current = -1
    hideHint()
    dispatch({type: 'previous'})
  }, [hideHint])

  // leave the player — back to wherever we came from, falling back to the landing
  const handleExit = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])

  // --- swipe to navigate (runs on the JS thread so it can dispatch directly) ---
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(hideHint)
        .onEnd((event) => {
          if (event.translationX <= -SWIPE_THRESHOLD) goNext()
          else if (event.translationX >= SWIPE_THRESHOLD) goPrevious()
        }),
    [hideHint, goNext, goPrevious]
  )

  return (
    <ScreenBackground>
      <View className="flex-1">
        {/* slim top bar: exit · progress · language */}
        <SafeAreaView edges={['top', 'left', 'right']}>
          <View className="flex-row items-center gap-4 px-5 pb-1 pt-2">
            <Pressable onPress={handleExit} hitSlop={10} accessibilityLabel="exit deck">
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
            <View className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <View
                className="bg-primary-light h-1 rounded-full"
                style={{width: `${(position / total) * 100}%`}}
              />
            </View>
            <Text className="text-gray-dark text-sm tabular-nums">
              {position}/{total}
            </Text>
            {languages.length > 1 ? (
              <Pressable
                onPress={() => setLangModalOpen(true)}
                hitSlop={10}
                accessibilityLabel="change language"
              >
                <Ionicons name="language" size={22} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>

        {/* the question — swipe anywhere to navigate */}
        <GestureDetector gesture={gesture}>
          <View className="flex-1 px-8 py-2">
            <View className="flex-1 justify-center" onLayout={onBoxLayout}>
              <Animated.View style={cardStyle}>
                <Text
                  className="font-semibold text-white"
                  style={{
                    fontSize,
                    lineHeight: fontSize * LINE_HEIGHT_RATIO,
                    writingDirection: direction,
                  }}
                >
                  {text}
                </Text>
              </Animated.View>
            </View>
          </View>
        </GestureDetector>

        {/* fading swipe hint — Animated.View carries only opacity; inner View holds layout */}
        <SafeAreaView edges={['bottom', 'left', 'right']}>
          <Animated.View style={{opacity: hintOpacity}}>
            <View className="flex-row items-center justify-center gap-2 pb-4 pt-1">
              <Ionicons name="chevron-back" size={16} color={colors.gray.dark} />
              <Text className="text-gray-dark text-xs uppercase tracking-widest">Swipe</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.gray.dark} />
            </View>
          </Animated.View>
        </SafeAreaView>

        <LanguageModal
          visible={langModalOpen}
          languages={languages}
          current={language}
          onSelect={(next) => {
            setLanguage(next)
            setLangModalOpen(false)
          }}
          onClose={() => setLangModalOpen(false)}
        />
      </View>
    </ScreenBackground>
  )
}
