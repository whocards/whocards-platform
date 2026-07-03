import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import {Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import type {GameId} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import type {Entitlement} from '@/lib/entitlements'
import {getEntitlement} from '@/lib/entitlements'
import {GAME_CATALOG} from '@/lib/games'

// Caps the sheet at this fraction of the window so max Dynamic Type or a compact
// device in landscape can't push the last row off-screen — content still sizes
// naturally (well under this cap in the normal case) and only this section
// scrolls; the header stays put. Same constant/rationale as settings-modal.tsx.
const SHEET_MAX_HEIGHT_RATIO = 0.8

type GameModalProps = {
  visible: boolean
  current: GameId
  onSelect: (game: GameId) => void
  onClose: () => void
}

/**
 * Game picker — a compact bottom sheet content-hugging sized to the catalog
 * (issue #189, second pass): opened on top of the already-compact
 * SettingsModal, a full `presentationStyle="pageSheet"` native card here read
 * as broken (owner on-device feedback on the first #189 pass, which kept this
 * sheet as pageSheet — see settings-modal.tsx's updated doc comment for the
 * reversal). Now the exact same treatment as SettingsModal: a transparent,
 * `statusBarTranslucent` `Modal` with a dimmed backdrop, and a
 * `rounded-t-3xl` sheet sized to its content, capped at
 * `SHEET_MAX_HEIGHT_RATIO` of the window (GAME_CATALOG is short today, but
 * the cap is here for the same reason it's on every sheet in this family —
 * cheap insurance against a taller catalog or Dynamic Type later).
 *
 * Backdrop coordination: this sheet renders its own standard `bg-black/50`
 * dim, same as if it were opened standalone — it doesn't know or care that
 * its only caller (SettingsModal) is itself a dimmed sheet. SettingsModal is
 * the one place that knows about the nesting, so it's the one that hides its
 * own backdrop+content while this sheet is open (see its doc comment) —
 * that's what keeps this from stacking two dims into a murky double-dim
 * rather than something duplicated here.
 *
 * Paid-tier Games resolved as `early_access` wear an "Included in early
 * access" pill (ADR-0006): players learn these are paid features before
 * purchases exist, so the future paywall is a communicated transition rather
 * than a silent removal.
 *
 * Themed (issue #163, amendment 1): a dark surface in dark mode, the
 * pre-existing light sheet surface in light mode — see
 * docs/design/163-light-mode/proposal.md.
 */
export const GameModal = ({visible, current, onSelect, onClose}: GameModalProps) => {
  const insets = useSafeAreaInsets()
  const [entitlements, setEntitlements] = useState<Partial<Record<GameId, Entitlement>>>({})
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

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

  const {height: windowHeight} = useWindowDimensions()
  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android only: without this, the status-bar strip isn't part of the
      // Modal's surface, so the backdrop dims everything below it but leaves
      // the status-bar area undimmed — same as every other sheet in this family.
      statusBarTranslucent
    >
      {/* Dark sheet → light status-bar icons; light sheet → dark icons. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1 justify-end">
        {/* Dimmed backdrop — see the doc comment above on why this is a normal,
            undiscounted dim rather than something lighter for the nested case. */}
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
          accessibilityLabel="dismiss"
        />
        {/* No-op tap target: swallows taps landing on the sheet's own whitespace
            so they don't fall through to the backdrop above and close the sheet.
            `accessible={false}` keeps this out of the accessibility tree so it
            doesn't swallow every row's own label into one opaque element (a
            Pressable is `accessible` by default, which would otherwise group
            everything below into a single unlabeled node). */}
        <Pressable
          onPress={() => {}}
          accessible={false}
          className="bg-white dark:bg-dark rounded-t-3xl"
          style={{paddingBottom: Math.max(insets.bottom, 24)}}
        >
          {/* On Android with statusBarTranslucent, the sheet can otherwise sit
              under the status bar/notch on a device in the rare case its
              content pushes the header above the safe area. */}
          <View
            className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
            style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
          >
            <Text className="text-darker dark:text-white font-title text-2xl">
              Choose your game
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
              <Ionicons name="close" size={24} color={iconColor} />
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
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
                      <Text className="text-darker dark:text-white font-sans text-lg">
                        {game.title}
                      </Text>
                      {entitlement?.granted && entitlement.reason === 'early_access' ? (
                        <View className="rounded-full bg-yellow-400 px-2 py-0.5">
                          <Text className="text-darker font-sans text-xs font-bold">
                            Included in early access
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {selected ? (
                      <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                    {game.description}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </View>
    </Modal>
  )
}
