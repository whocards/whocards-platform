import {Ionicons} from '@expo/vector-icons'
import {Link} from 'expo-router'
import {useEffect, useState} from 'react'
import {Image, Pressable, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {DEFAULT_DECK_SLUG, libraryDeck, resolveDeck} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {ScreenBackground} from '@/components/screen-background'
import {trpc} from '@/lib/trpc'

// We launch with the original WhoCards deck; its content ships in-app for offline play.
const deck = resolveDeck(libraryDeck)
const logo = require('../../assets/images/logo.png')

export default function LandingScreen() {
  const [serverMeta, setServerMeta] = useState<{cards: number; languages: number} | null>(null)

  useEffect(() => {
    // offline-first: render the bundled numbers, silently reconcile with the API (ADR-0002)
    trpc.decks.manifest
      .query()
      .then((decks) => {
        const live = decks.find((entry) => entry.slug === DEFAULT_DECK_SLUG)
        if (live) setServerMeta({cards: live.questionCount, languages: live.languages.length})
      })
      .catch(() => undefined)
  }, [])

  const cards = serverMeta?.cards ?? deck.questionIds.length
  const languages = serverMeta?.languages ?? deck.languages.length

  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1 items-center justify-between px-8 pb-8 pt-16">
        <View className="flex-1 items-center justify-center">
          <Image
            source={logo}
            resizeMode="contain"
            accessibilityLabel="WhoCards"
            // explicit width AND height — native sizes a required image to its
            // intrinsic pixels otherwise (aspectRatio alone only works on web)
            style={{width: 280, height: Math.round((280 * 226) / 1200)}}
          />
          <Text className="mt-7 text-center font-sans text-xl font-semibold leading-8 text-white/80">
            Change your world,{'\n'}one conversation at a time.
          </Text>
        </View>

        <View className="w-full items-center gap-5">
          <Text className="text-gray-dark font-sans text-sm">
            {cards} cards · {languages} languages
          </Text>
          <Link href={`/play/${DEFAULT_DECK_SLUG}`} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play"
              className="active:bg-yellow-500 w-full flex-row items-center justify-center rounded-full bg-yellow-400 py-4"
            >
              <Ionicons name="play" size={18} color={colors.darker} style={{marginRight: 8}} />
              <Text className="text-darker font-sans text-base font-bold">Play</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  )
}
