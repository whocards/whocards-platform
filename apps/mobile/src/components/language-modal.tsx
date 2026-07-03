import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {MAX_SECONDARY_LANGUAGES} from '@/lib/language-constants'

type LanguageModalProps = {
  visible: boolean
  languages: string[]
  current: string
  /** Secondary display languages shown under the primary on the card (max 2). */
  secondary?: string[]
  onSelect: (language: string) => void
  onSecondaryChange?: (languages: string[]) => void
  /** Tabletop mode (issue #148): the Card renders the Question twice, mirrored
   * 180°, for two sides of a flat phone to read at once. */
  tabletop?: boolean
  onTabletopChange?: (enabled: boolean) => void
  onClose: () => void
}

/**
 * Native language picker — the OS sheet (`presentationStyle="pageSheet"`): an iOS
 * card sheet with swipe-to-dismiss, a full native modal on Android. Mirrors the
 * web's "Choose your language" modal. `onDismiss` keeps `visible` in sync when the
 * sheet is swiped away.
 *
 * Three sections: the primary language (single choice — drives sharing, deep
 * links, layout direction), "Also show" (a Display setting: up to two extra
 * languages rendered under the primary on the card), and Tabletop mode (issue
 * #148, a Display setting). The primary never appears in "Also show".
 *
 * A single-language deck has no language choice to make, so the primary-language
 * list (and its "Choose your language" title) would be one inert, always-checked
 * row — this sheet becomes display-settings-only for that deck: the language
 * list is hidden and the title reads "Display settings" instead (still true when
 * there's nothing to toggle on, i.e. no onTabletopChange either — the header
 * copy just describes what the sheet is, even if it turns out empty).
 *
 * Themed (issue #163, amendment 1): a dark surface in dark mode, the
 * pre-existing light sheet surface in light mode — see
 * docs/design/163-light-mode/proposal.md. The Theme Display setting itself
 * lives on the Library screen, not in here (see theme-modal.tsx) — this sheet
 * stays scoped to the deck-level Display settings it already owned.
 */
export const LanguageModal = ({
  visible,
  languages,
  current,
  secondary = [],
  onSelect,
  onSecondaryChange,
  tabletop = false,
  onTabletopChange,
  onClose,
}: LanguageModalProps) => {
  const insets = useSafeAreaInsets()
  const hasLanguageChoice = languages.length > 1
  const showSecondary = onSecondaryChange !== undefined && hasLanguageChoice
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

  const toggleSecondary = (code: string) => {
    if (!onSecondaryChange) return
    if (secondary.includes(code)) {
      onSecondaryChange(secondary.filter((entry) => entry !== code))
      return
    }
    if (secondary.length >= MAX_SECONDARY_LANGUAGES) return
    onSecondaryChange([...secondary, code])
  }

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
          <Text className="text-darker dark:text-white font-title text-2xl">
            {hasLanguageChoice ? 'Choose your language' : 'Display settings'}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={iconColor} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{paddingBottom: Math.max(insets.bottom, 24)}}>
          {hasLanguageChoice
            ? languages.map((code) => {
                const selected = code === current
                return (
                  <Pressable
                    key={code}
                    onPress={() => onSelect(code)}
                    className={`flex-row items-center justify-between px-5 py-4 ${
                      selected ? 'bg-yellow-300/40' : ''
                    }`}
                  >
                    <Text className="text-darker dark:text-white font-sans text-lg">
                      {getLanguageName(code) ?? code}
                    </Text>
                    {selected ? (
                      <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })
            : null}

          {showSecondary ? (
            <>
              <View className="border-gray-lighter dark:border-white/10 mt-2 border-t px-5 pb-1 pt-5">
                <Text className="text-darker dark:text-white font-title text-lg">Also show</Text>
                <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                  Show the question in up to {MAX_SECONDARY_LANGUAGES} more languages.
                </Text>
              </View>
              {languages
                .filter((code) => code !== current)
                .map((code) => {
                  const checked = secondary.includes(code)
                  const disabled = !checked && secondary.length >= MAX_SECONDARY_LANGUAGES
                  return (
                    <Pressable
                      key={`secondary-${code}`}
                      onPress={() => toggleSecondary(code)}
                      disabled={disabled}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked, disabled}}
                      className={`flex-row items-center justify-between px-5 py-3 ${
                        checked ? 'bg-yellow-300/40' : ''
                      }`}
                    >
                      <Text
                        className={`font-sans text-lg ${
                          disabled
                            ? 'text-mutedOnLight dark:text-gray-dark'
                            : 'text-darker dark:text-white'
                        }`}
                      >
                        {getLanguageName(code) ?? code}
                      </Text>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={
                          checked
                            ? isDark
                              ? colors.accentOnDark
                              : colors.accentOnLight
                            : isDark
                              ? colors.gray.dark
                              : colors.mutedOnLight
                        }
                      />
                    </Pressable>
                  )
                })}
            </>
          ) : null}

          {onTabletopChange ? (
            <>
              {/* No divider when this is the sheet's first section — a single-language
                  deck skips the language list above, so a top border here would float
                  with nothing to separate from. */}
              <View
                className={`border-gray-lighter dark:border-white/10 px-5 pb-1 pt-5 ${
                  hasLanguageChoice ? 'mt-2 border-t' : ''
                }`}
              >
                <Text className="text-darker dark:text-white font-title text-lg">
                  Tabletop mode
                </Text>
                <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                  Lay the phone flat on the table — the question mirrors on top so both sides can
                  read it at once.
                </Text>
              </View>
              <Pressable
                onPress={() => onTabletopChange(!tabletop)}
                accessibilityRole="switch"
                accessibilityLabel="Tabletop mode"
                accessibilityState={{checked: tabletop}}
                className={`flex-row items-center justify-between px-5 py-3 ${
                  tabletop ? 'bg-yellow-300/40' : ''
                }`}
              >
                <Text className="text-darker dark:text-white font-sans text-lg">
                  Two-way readable
                </Text>
                <Ionicons
                  name={tabletop ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={
                    tabletop
                      ? isDark
                        ? colors.accentOnDark
                        : colors.accentOnLight
                      : isDark
                        ? colors.gray.dark
                        : colors.mutedOnLight
                  }
                />
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}
