import {Link} from 'expo-router'
import {useEffect, useState} from 'react'
import {FlatList, Pressable, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {getAllDecks} from '@whocards/decks'

import {trpc} from '@/lib/trpc'

// Content ships in-app for offline play; the server is consulted to revalidate.
const decks = getAllDecks()

export default function LibraryScreen() {
  const [serverDeckCount, setServerDeckCount] = useState<number | null>(null)

  useEffect(() => {
    // consume the shared tRPC API (ADR-0002); silently stay offline-first
    trpc.decks.manifest
      .query()
      .then((manifest) => setServerDeckCount(manifest.length))
      .catch(() => setServerDeckCount(null))
  }, [])

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="px-6 pb-4 pt-2">
        <Text className="font-title text-4xl font-semibold text-white">WhoCards</Text>
        <Text className="text-gray-dark mt-1 text-base">
          Your library
          {serverDeckCount === null ? '' : ` · ${serverDeckCount} decks online`}
        </Text>
      </View>
      <FlatList
        data={decks}
        keyExtractor={(deck) => deck.slug}
        contentContainerStyle={{paddingHorizontal: 24, paddingBottom: 40, gap: 12}}
        renderItem={({item}) => (
          <Link href={`/play/${item.slug}`} asChild>
            <Pressable className="bg-dark active:bg-darker rounded-2.5xl p-5">
              <Text className="text-xl font-semibold text-white">{item.title}</Text>
              <Text className="text-gray-dark mt-1" numberOfLines={2}>
                {item.description}
              </Text>
              <Text className="text-primary-light mt-3 text-sm uppercase">
                {item.questionIds.length} cards · {item.languages.length} languages
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  )
}
