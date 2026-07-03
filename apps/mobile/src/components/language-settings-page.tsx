import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'

// Caps the page at this fraction of the window — the one page in this family
// where this cap actually matters day-to-day rather than just as edge-case
// insurance: the language list plus "Also show" section is unbounded (grows
// with the deck's language count), so on a deck with many languages this is
// what keeps the page from trying to be taller than the screen instead of
// scrolling.
const SHEET_MAX_HEIGHT_RATIO = 0.8

type LanguageSettingsPageProps = {
  languages: string[]
  current: string
  /** The one secondary display language shown under the primary on the card
   * (issue #176: reduced from up to 2 down to at most 1 — an empty array means
   * "none chosen"). */
  secondary?: string[]
  onSelect: (language: string) => void
  onSecondaryChange?: (languages: string[]) => void
  onBack: () => void
}

/**
 * Language picker — one page in SettingsModal's single-Modal pager (issue
 * #189, third pass). Extracted from the standalone `LanguageModal` component
 * the second #189 pass built — see game-settings-page.tsx's doc comment for
 * why the separate-Modal-per-page approach was abandoned in favor of one
 * Modal with internal pages. `LanguageModal` itself is gone; settings-modal.tsx
 * was its only caller. The unbounded-list concern that originally kept this
 * one page on a full native sheet is now handled by `SHEET_MAX_HEIGHT_RATIO`
 * (capped, scrolling) instead — same answer the second pass already landed on
 * for all three pages, carried forward here.
 *
 * Two sections: the primary language (single choice — drives sharing, deep
 * links, layout direction) and "Also show" (a Display setting: one optional
 * extra language rendered under the primary on the card, issue #176). The
 * primary never appears in "Also show". Unlike Game/Theme, selecting a
 * primary language does NOT slide back to the menu automatically — callers
 * often want to also toggle an "Also show" secondary right after, so this
 * page stays put until the back arrow is pressed (same as the pre-pager
 * behavior: settings-modal.tsx's `onSelect` handler never auto-closed this
 * one either).
 *
 * A single-language deck has no language choice to make (and, with only one
 * language, no possible "Also show" alternate either) — the primary-language
 * list is hidden in that case rather than rendering one inert, always-checked
 * row.
 */
export const LanguageSettingsPage = ({
  languages,
  current,
  secondary = [],
  onSelect,
  onSecondaryChange,
  onBack,
}: LanguageSettingsPageProps) => {
  const hasLanguageChoice = languages.length > 1
  const showSecondary = onSecondaryChange !== undefined && hasLanguageChoice
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'

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
    <View>
      <SettingsSheetHeader
        title={hasLanguageChoice ? 'Choose your language' : 'Language'}
        icon="back"
        onPress={onBack}
      />
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
    </View>
  )
}
