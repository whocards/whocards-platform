import {useLocalSearchParams} from 'expo-router'
import {useEffect, useState} from 'react'
import {StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {DEFAULT_GAME, getDeck, isPoolBacked} from '@whocards/decks'

import {ScreenBackground} from '@/components/screen-background'
import {UnifiedPlayer} from '@/components/unified-player'
import {getStoredGame} from '@/lib/game-store'
import {useT} from '@/lib/i18n'
import {peekPendingTargetGame} from '@/lib/play-transition'

// react-native-css's safe-area adapter re-exports the platform SafeAreaView,
// which does not consume className (see app/index.tsx).
const missingDeckContainerStyle = StyleSheet.create({
  root: {flex: 1, alignItems: 'center', justifyContent: 'center'},
}).root

export default function PlayScreen() {
  const {deck: slug, q, lang} = useLocalSearchParams<{deck: string; q?: string; lang?: string}>()
  const deck = getDeck(slug)
  const t = useT()

  // Deep links (`?q=`) always open Classic so shared links & screenshots stay reproducible.
  const isDeepLink = typeof q === 'string'
  const [initialGame, setInitialGame] = useState<GameId | null>(() =>
    isDeepLink ? DEFAULT_GAME : peekPendingTargetGame()
  )

  useEffect(() => {
    if (isDeepLink || initialGame !== null) return
    void getStoredGame().then(setInitialGame)
  }, [isDeepLink, initialGame])

  if (!deck) {
    return (
      <ScreenBackground>
        <SafeAreaView style={missingDeckContainerStyle}>
          <Text className="text-darker dark:text-white font-sans">{t('deck.notFound')}</Text>
        </SafeAreaView>
      </ScreenBackground>
    )
  }

  if (initialGame === null) {
    return (
      <ScreenBackground>
        <View className="flex-1" />
      </ScreenBackground>
    )
  }

  return (
    <UnifiedPlayer
      deckSlug={deck.slug}
      questionIds={deck.questionIds}
      questions={deck.questions}
      languages={deck.languages}
      poolBacked={isPoolBacked(deck)}
      initialGame={initialGame}
      startId={typeof q === 'string' ? q : undefined}
      startLanguage={typeof lang === 'string' ? lang : undefined}
    />
  )
}
