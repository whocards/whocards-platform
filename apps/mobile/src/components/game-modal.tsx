import {Ionicons} from '@expo/vector-icons'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import type {Entitlement} from '@/lib/entitlements'
import {getEntitlement} from '@/lib/entitlements'
import {GAME_CATALOG} from '@/lib/games'

type GameModalProps = {
  visible: boolean
  current: GameId
  onSelect: (game: GameId) => void
  onClose: () => void
}

/**
 * Native Game picker — same OS sheet treatment as the language modal
 * (`presentationStyle="pageSheet"`). Paid-tier Games resolved as
 * `early_access` wear an "Included in early access" pill (ADR-0006): players
 * learn these are paid features before purchases exist, so the future paywall
 * is a communicated transition rather than a silent removal.
 */
export const GameModal = ({visible, current, onSelect, onClose}: GameModalProps) => {
  const insets = useSafeAreaInsets()
  const [entitlements, setEntitlements] = useState<Partial<Record<GameId, Entitlement>>>({})

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void Promise.all(
      GAME_CATALOG.map(async (game) => [game.id, await getEntitlement(game.tier)] as const)
    ).then((entries) => {
      if (!cancelled) setEntitlements(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [visible])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {/* Dark status-bar icons are legible over this white sheet. */}
      <StatusBar style="dark" />
      <View className="flex-1 bg-white">
        {/* On Android, pageSheet renders behind the status bar, so push the header
            below the display cutout. On iOS the card sheet already insets itself. */}
        <View
          className="border-gray-lighter flex-row items-center justify-between border-b px-5 py-4"
          style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
        >
          <Text className="text-darker font-title text-2xl">Choose your game</Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.darker} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{paddingBottom: Math.max(insets.bottom, 24)}}>
          {GAME_CATALOG.map((game) => {
            const selected = game.id === current
            const entitlement = entitlements[game.id]
            return (
              <Pressable
                key={game.id}
                onPress={() => onSelect(game.id)}
                accessibilityRole="button"
                accessibilityLabel={game.title}
                accessibilityState={{selected}}
                className={`gap-1 px-5 py-4 ${selected ? 'bg-yellow-300/40' : ''}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-darker font-sans text-lg">{game.title}</Text>
                    {entitlement?.granted && entitlement.reason === 'early_access' ? (
                      <View className="rounded-full bg-yellow-400 px-2 py-0.5">
                        <Text className="text-darker font-sans text-xs font-bold">
                          Included in early access
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {selected ? <Text className="text-primary-dark text-lg font-bold">✓</Text> : null}
                </View>
                <Text className="text-gray-dark font-sans text-sm">{game.description}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}
