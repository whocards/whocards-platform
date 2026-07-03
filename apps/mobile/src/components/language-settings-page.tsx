import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native'
import {getLanguageName} from '@whocards/decks'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'

// Caps the page at this fraction of the window — the one page in this family
// where this cap actually matters day-to-day rather than just as edge-case
// insurance: the primary-language list is unbounded (grows with the deck's
// language count), so on a deck with many languages this is what keeps the
// page from trying to be taller than the screen instead of scrolling.
const SHEET_MAX_HEIGHT_RATIO = 0.8

type LanguageSettingsPageProps = {
  languages: string[]
  current: string
  onSelect: (language: string) => void
  onBack: () => void
}

/**
 * Primary language picker — one page in SettingsModal's single-Modal pager
 * (issue #189, third/fourth pass). Extracted from the standalone
 * `LanguageModal` component the second #189 pass built — see
 * game-settings-page.tsx's doc comment for why the separate-Modal-per-page
 * approach was abandoned in favor of one Modal with internal pages.
 *
 * Split from the "Also show" secondary-language picker (issue #189, owner
 * on-device feedback: "split the second language selector into a separate
 * section in game play options") — that's now its own menu row and page,
 * `second-language-settings-page.tsx`. That split removes the one reason this
 * page used to stay open after a pick (letting you also toggle a secondary
 * right after, on the same page) — so selecting a primary language now slides
 * back to the menu like every other single-pick page (Game, Theme, Second
 * language), instead of the pre-split behavior of staying put.
 *
 * A single-language deck has no language choice to make — the list is hidden
 * in that case rather than rendering one inert, always-checked row.
 */
export const LanguageSettingsPage = ({
  languages,
  current,
  onSelect,
  onBack,
}: LanguageSettingsPageProps) => {
  const hasLanguageChoice = languages.length > 1

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
      </ScrollView>
    </View>
  )
}
