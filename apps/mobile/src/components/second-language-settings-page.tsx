import {Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native'
import {getLanguageName} from '@whocards/decks'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'

// Same cap/rationale as language-settings-page.tsx — this list is bounded by
// the same deck's language count, so it's the same edge-case insurance.
const SHEET_MAX_HEIGHT_RATIO = 0.8

type SecondLanguageSettingsPageProps = {
  languages: string[]
  /** The current primary language — excluded from the choices below (a
   * secondary can never also be the primary). */
  current: string
  /** issue #176: reduced from up to 2 down to at most 1 — an empty array
   * means "none chosen". */
  secondary: string[]
  onChange: (languages: string[]) => void
  onBack: () => void
}

/**
 * Second (secondary display) language picker — its own page and menu row now
 * (issue #189, owner on-device feedback: "split the second language selector
 * into a separate section in game play options"). Previously this was an
 * "Also show" checkbox list living beneath the primary language list on the
 * same page (see language-settings-page.tsx's doc comment) — pulled out here
 * as a standalone picker so it reads as its own setting rather than a
 * sub-section of Language.
 *
 * A Display setting (issue #148/#176): one optional extra language rendered
 * under the primary on the card. Never changes which Card is drawn or the
 * question's actual content (CONTEXT.md's Display-setting boundary) — purely
 * which translation(s) render.
 *
 * "None" is its own selectable row (rather than a separate clear action) so
 * the whole page reads as one radio-style choice — pick a second language, or
 * pick "None" — the same interaction shape as the primary Language page
 * (issue #176: exactly one secondary or none; picking a different one
 * replaces whatever was chosen, no cap-reached "blocked" state to design for,
 * unlike the old up-to-2 version). Selecting any option here slides back to
 * the menu, matching every other single-pick page (Game, Theme, primary
 * Language) — a pick is a complete action.
 */
export const SecondLanguageSettingsPage = ({
  languages,
  current,
  secondary,
  onChange,
  onBack,
}: SecondLanguageSettingsPageProps) => {
  const options = languages.filter((code) => code !== current)
  const noneSelected = secondary.length === 0

  const {height: windowHeight} = useWindowDimensions()
  const sheetMaxHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO

  return (
    <View>
      <SettingsSheetHeader title="Second language" icon="back" onPress={onBack} />
      <ScrollView style={{maxHeight: sheetMaxHeight}} bounces={false}>
        <Pressable
          onPress={() => onChange([])}
          accessibilityRole="button"
          accessibilityState={{selected: noneSelected}}
          className={`flex-row items-center justify-between px-5 py-4 ${
            noneSelected ? 'bg-yellow-300/40' : ''
          }`}
        >
          <Text className="text-darker dark:text-white font-sans text-lg">None</Text>
          {noneSelected ? (
            <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">✓</Text>
          ) : null}
        </Pressable>
        {options.map((code) => {
          const selected = secondary.includes(code)
          return (
            <Pressable
              key={code}
              onPress={() => onChange([code])}
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
        })}
      </ScrollView>
    </View>
  )
}
