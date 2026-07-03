import {Pressable, Text, View} from 'react-native'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'
import type {ThemeSetting} from '@/lib/theme-store'

type ThemeSettingsPageProps = {
  current: ThemeSetting
  onSelect: (theme: ThemeSetting) => void
  onBack: () => void
}

const OPTIONS: {value: ThemeSetting; label: string}[] = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
]

/**
 * Theme picker — one page in SettingsModal's single-Modal pager (issue #189,
 * third pass). Extracted from the standalone `ThemeModal` component the
 * second #189 pass built — see game-settings-page.tsx's doc comment for why
 * the separate-Modal-per-page approach was abandoned in favor of one Modal
 * with internal pages. `ThemeModal` itself is gone; settings-modal.tsx was
 * its only caller.
 *
 * Selecting an option calls `onSelect` and its caller (settings-modal.tsx)
 * slides back to the menu — a pick is a complete action here, same as before.
 *
 * A separate page from the per-deck Language page's "Also show" secondary
 * language (issue #148): those are deck-scoped Display settings that only
 * make sense once a Deck is open. Theme is a device-global, pre-session
 * preference — like the Game choice, it's relevant on the Library screen
 * before any Deck is open (the Library canvas itself follows it) — so it
 * gets its own row beside "Game" in the menu rather than living inside the
 * Language page.
 */
export const ThemeSettingsPage = ({current, onSelect, onBack}: ThemeSettingsPageProps) => (
  <View>
    <SettingsSheetHeader title="Theme" icon="back" onPress={onBack} />
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
        Matches your device by default. Presentation only — it never changes which Card is drawn or
        your progress.
      </Text>
    </View>
  </View>
)

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
