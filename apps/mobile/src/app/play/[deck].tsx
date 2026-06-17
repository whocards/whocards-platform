import {useLocalSearchParams} from 'expo-router'
import {useMemo, useReducer, useState} from 'react'
import {Pressable, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {QuestionSet} from '@whocards/decks'
import {getDeck, getDirection, getInitialNav, navReducer} from '@whocards/decks'

export default function PlayScreen() {
  const {deck: slug} = useLocalSearchParams<{deck: string}>()
  const deck = getDeck(slug)

  if (!deck) {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center">
        <Text className="text-white">Deck not found.</Text>
      </SafeAreaView>
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
  // the shared headless engine — identical behaviour to the web <Play> (ADR-0003)
  const reducer = useMemo(() => navReducer(questionIds), [questionIds])
  const [{ids, idx}, dispatch] = useReducer(reducer, undefined, () => getInitialNav(questionIds))
  const defaultLanguage = languages[0]
  const [language, setLanguage] = useState(defaultLanguage)

  const questionId = ids[idx]
  const text = questions[questionId]?.[language] ?? questions[questionId]?.[defaultLanguage] ?? ''
  const direction = getDirection(language)

  const cycleLanguage = () => {
    const next = languages[(languages.indexOf(language) + 1) % languages.length]
    setLanguage(next)
  }

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 justify-center px-6">
        <Text
          className="text-3xl font-semibold leading-snug text-white"
          style={{writingDirection: direction}}
        >
          {text}
        </Text>
      </View>
      <View className="flex-row items-center justify-between px-6 pb-4">
        <Pressable onPress={() => dispatch({type: 'previous'})} disabled={idx === 0}>
          <Text className={`text-primary-light text-lg ${idx === 0 ? 'opacity-40' : ''}`}>
            ‹ Prev
          </Text>
        </Pressable>

        {languages.length > 1 ? (
          <Pressable onPress={cycleLanguage} className="bg-gray rounded-full px-4 py-2">
            <Text className="uppercase text-white">{language}</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={() => dispatch({type: 'next'})}>
          <Text className="text-primary-light text-lg">Next ›</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
