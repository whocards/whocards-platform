import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import type {ThemeSetting} from '@/lib/theme-store'

// Caps the sheet at this fraction of the window so max Dynamic Type can't push
// the description text off-screen — content still sizes naturally (well under
// this cap in the normal case) and only this section scrolls; the header stays
// put. Same constant/rationale as settings-modal.tsx.
const SHEET_MAX_HEIGHT_RATIO = 0.8

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
 * Theme picker — a compact bottom sheet content-hugging sized to its own
 * three-option segmented control plus a line of description (issue #189,
 * second pass): opened on top of the already-compact SettingsModal, a full
 * `presentationStyle="pageSheet"` native card here read as broken (owner
 * on-device feedback on the first #189 pass, which kept this sheet as
 * pageSheet — see settings-modal.tsx's updated doc comment for the
 * reversal). Now the exact same treatment as SettingsModal: a transparent,
 * `statusBarTranslucent` `Modal` with a dimmed backdrop, and a
 * `rounded-t-3xl` sheet sized to its content.
 *
 * Backdrop coordination: this sheet renders its own standard `bg-black/50`
 * dim, same as if it were opened standalone — it doesn't know or care that
 * its only caller (SettingsModal) is itself a dimmed sheet. SettingsModal is
 * the one place that knows about the nesting, so it's the one that hides its
 * own backdrop+content while this sheet is open (see its doc comment) —
 * that's what keeps this from stacking two dims into a murky double-dim
 * rather than something duplicated here.
 *
 * A separate sheet from the per-deck Language modal's "Display settings"
 * (Tabletop mode, secondary languages, issue #148): those are deck-scoped
 * Display settings that only make sense once a Deck is open, surfaced from
 * the player. Theme is a device-global, pre-session preference — like the
 * Game choice, it's relevant on the Library screen before any Deck is open
 * (the Library canvas itself follows it) — so it gets its own entry point
 * beside "Game" rather than living inside the player's sheet. Named "Theme",
 * not "Display", specifically to avoid colliding with that other sheet's name.
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
            doesn't swallow the segmented control's own labels into one opaque
            element (a Pressable is `accessible` by default, which would
            otherwise group everything below into a single unlabeled node). */}
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
            <Text className="text-darker dark:text-white font-title text-2xl">Theme</Text>
            <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
              <Ionicons name="close" size={24} color={iconColor} />
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
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
                Matches your device by default. Presentation only — it never changes which Card is
                drawn or your progress.
              </Text>
            </View>
          </ScrollView>
        </Pressable>
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
