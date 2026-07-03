import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import type {ThemeSetting} from '@/lib/theme-store'

type ThemeModalProps = {
  visible: boolean
  current: ThemeSetting
  onSelect: (theme: ThemeSetting) => void
  onClose: () => void
}

const OPTIONS: {value: ThemeSetting; label: string}[] = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
]

/**
 * Native Theme picker — same OS sheet treatment as the Game/Language modals
 * (`presentationStyle="pageSheet"`). A separate sheet from the per-deck
 * Language modal's "Display settings" (Tabletop mode, secondary languages,
 * issue #148): those are deck-scoped Display settings that only make sense
 * once a Deck is open, surfaced from the player. Theme is a device-global,
 * pre-session preference — like the Game choice, it's relevant on the Library
 * screen before any Deck is open (the Library canvas itself follows it) — so
 * it gets its own entry point beside "Game" rather than living inside the
 * player's sheet. Named "Theme", not "Display", specifically to avoid
 * colliding with that other sheet's name.
 *
 * Themed itself (issue #163, amendment 1): a dark surface in dark mode, the
 * pre-existing light sheet surface in light mode — see
 * docs/design/163-light-mode/proposal.md.
 */
export const ThemeModal = ({visible, current, onSelect, onClose}: ThemeModalProps) => {
  const insets = useSafeAreaInsets()
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {/* Dark sheet → light status-bar icons; light sheet → dark icons. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="bg-white dark:bg-dark flex-1">
        {/* On Android, pageSheet renders behind the status bar, so push the header
            below the display cutout. On iOS the card sheet already insets itself. */}
        <View
          className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
          style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
        >
          <Text className="text-darker dark:text-white font-title text-2xl">Theme</Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={iconColor} />
          </Pressable>
        </View>
        <View className="px-5 py-4">
          <View className="bg-gray-lighter dark:bg-white/10 flex-row rounded-xl p-1">
            {OPTIONS.map((option) => {
              const selected = option.value === current
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Theme: ${option.label}`}
                  accessibilityState={{selected}}
                  className={`flex-1 items-center rounded-lg py-2.5 ${
                    selected ? 'bg-white dark:bg-dark' : ''
                  }`}
                  style={selected ? styles.selectedShadow : undefined}
                >
                  <Text
                    className={`text-darker dark:text-white font-sans text-sm ${
                      selected ? 'font-bold' : ''
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text className="text-mutedOnLight dark:text-gray-dark mt-4 font-sans text-sm leading-5">
            Matches your device by default. Presentation only — it never changes which Card is drawn
            or your progress.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

// A plain style object for the selected segment's shadow — NativeWind's `shadow-*`
// utilities target web-style CSS shadows; a small native shadow reads better here
// for a pressed-looking selected segment (matches the segmented-control mock).
const styles = {
  selectedShadow: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
} as const
