import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

// Caps the sheet at this fraction of the window — the one sheet in this family
// where this cap actually matters day-to-day rather than just as edge-case
// insurance: the language list plus "Also show" section is unbounded (grows
// with the deck's language count), so on a deck with many languages this is
// what keeps the sheet from trying to be taller than the screen instead of
// scrolling. Same constant/rationale as settings-modal.tsx.
const SHEET_MAX_HEIGHT_RATIO = 0.8

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
 * Language picker — a compact bottom sheet content-hugging sized to its own
 * list, capped at `SHEET_MAX_HEIGHT_RATIO` of the window and scrolling past
 * that (issue #189, second pass): opened on top of the already-compact
 * SettingsModal, a full `presentationStyle="pageSheet"` native card here read
 * as broken (owner on-device feedback on the first #189 pass, which kept this
 * sheet as pageSheet specifically because its list is unbounded — see
 * settings-modal.tsx's updated doc comment for the reversal). The height cap
 * is what answers that original objection: a deck with many languages
 * scrolls inside the capped sheet instead of needing the whole screen. Now
 * the exact same treatment as SettingsModal: a transparent,
 * `statusBarTranslucent` `Modal` with a dimmed backdrop, and a
 * `rounded-t-3xl` sheet.
 *
 * Backdrop coordination: this sheet renders its own standard `bg-black/50`
 * dim, same as if it were opened standalone — it doesn't know or care that
 * its only caller (SettingsModal) is itself a dimmed sheet. SettingsModal is
 * the one place that knows about the nesting, so it's the one that hides its
 * own backdrop+content while this sheet is open (see its doc comment) —
 * that's what keeps this from stacking two dims into a murky double-dim
 * rather than something duplicated here.
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
              {hasLanguageChoice ? 'Choose your language' : 'Language'}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
              <Ionicons name="close" size={24} color={iconColor} />
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
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
        </Pressable>
      </View>
    </Modal>
  )
}
