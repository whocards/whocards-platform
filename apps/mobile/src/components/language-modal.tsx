import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

type LanguageModalProps = {
  visible: boolean
  languages: string[]
  current: string
  /** The one secondary display language shown under the primary on the card
   * (issue #176: reduced from up to 2 down to at most 1 — an empty array means
   * "none chosen"). */
  secondary?: string[]
  onSelect: (language: string) => void
  onSecondaryChange?: (languages: string[]) => void
  onClose: () => void
}

/**
 * Native language picker — the OS sheet (`presentationStyle="pageSheet"`): an iOS
 * card sheet with swipe-to-dismiss, a full native modal on Android. Mirrors the
 * web's "Choose your language" modal. `onDismiss` keeps `visible` in sync when the
 * sheet is swiped away.
 *
 * Two sections: the primary language (single choice — drives sharing, deep
 * links, layout direction) and "Also show" (a Display setting: one optional
 * extra language rendered under the primary on the card, issue #176). The
 * primary never appears in "Also show". Tabletop mode used to live in this
 * sheet too (issue #148) — issue #176 moved it out to the top-level Settings
 * menu (settings-modal.tsx) since it's a global, not per-deck, preference; this
 * sheet is opened FROM that menu now, scoped to the one deck reachable from
 * the home screen (see settings-modal.tsx's doc comment for the scoping
 * decision), not from the play screens anymore.
 *
 * A single-language deck has no language choice to make (and, with only one
 * language, no possible "Also show" alternate either) — the primary-language
 * list is hidden in that case rather than rendering one inert, always-checked
 * row.
 *
 * Themed (issue #163, amendment 1): a dark surface in dark mode, the
 * pre-existing light sheet surface in light mode — see
 * docs/design/163-light-mode/proposal.md.
 */
export const LanguageModal = ({
  visible,
  languages,
  current,
  secondary = [],
  onSelect,
  onSecondaryChange,
  onClose,
}: LanguageModalProps) => {
  const insets = useSafeAreaInsets()
  const hasLanguageChoice = languages.length > 1
  const showSecondary = onSecondaryChange !== undefined && hasLanguageChoice
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

  // Exactly one secondary language, or none — picking a different one replaces
  // whatever was chosen (no cap-reached "blocked" state to design for, unlike
  // the old up-to-2 version); tapping the already-chosen row clears it.
  const toggleSecondary = (code: string) => {
    if (!onSecondaryChange) return
    onSecondaryChange(secondary.includes(code) ? [] : [code])
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
            {hasLanguageChoice ? 'Choose your language' : 'Language'}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={iconColor} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{paddingBottom: Math.max(insets.bottom, 24)}}>
          {hasLanguageChoice ? (
            languages.map((code) => {
              const selected = code === current
              return (
                <Pressable
                  key={code}
                  onPress={() => onSelect(code)}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
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
          ) : (
            <Text className="text-mutedOnLight dark:text-gray-dark px-5 py-4 font-sans text-base">
              This deck only has one language.
            </Text>
          )}

          {showSecondary ? (
            <>
              <View className="border-gray-lighter dark:border-white/10 mt-2 border-t px-5 pb-1 pt-5">
                <Text className="text-darker dark:text-white font-title text-lg">Also show</Text>
                <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-sm">
                  Show the question in one more language.
                </Text>
              </View>
              {languages
                .filter((code) => code !== current)
                .map((code) => {
                  const checked = secondary.includes(code)
                  return (
                    <Pressable
                      key={`secondary-${code}`}
                      onPress={() => toggleSecondary(code)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={getLanguageName(code) ?? code}
                      accessibilityState={{checked}}
                      className={`flex-row items-center justify-between px-5 py-3 ${
                        checked ? 'bg-yellow-300/40' : ''
                      }`}
                    >
                      <Text className="text-darker dark:text-white font-sans text-lg">
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
        </ScrollView>
      </View>
    </Modal>
  )
}
