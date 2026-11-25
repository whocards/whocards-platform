import {Pressable, ScrollView, Text, useWindowDimensions, View} from 'react-native'
import {getLanguageName} from '@whocards/decks'

import {SettingsSheetHeader} from '@/components/settings-sheet-header'

const SHEET_MAX_HEIGHT_RATIO = 0.8

const name = (code: string) => getLanguageName(code) ?? code

type LanguagesSettingsPageProps = {
  languages: string[]
  /** The primary language. */
  current: string
  /** The second language, at most one (issue #176); empty means none. */
  secondary: string[]
  onSelect: (language: string) => void
  onChangeSecondary: (languages: string[]) => void
  onBack: () => void
}

type OptionProps = {label: string; a11yLabel: string; selected: boolean; onPress: () => void}

const Option = ({label, a11yLabel, selected, onPress}: OptionProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={a11yLabel}
    accessibilityState={{selected}}
    className={`flex-row items-center justify-between px-5 py-3.5 ${selected ? 'bg-yellow-300/40' : ''}`}
  >
    <Text className="text-darker dark:text-white font-sans text-lg">{label}</Text>
    {selected ? (
      <Text className="text-accentOnLight dark:text-accentOnDark text-lg font-bold">✓</Text>
    ) : null}
  </Pressable>
)

const SectionLabel = ({children, first}: {children: string; first?: boolean}) => (
  <Text
    className={`text-mutedOnLight dark:text-gray-dark px-5 pb-1 font-sans text-xs font-bold uppercase tracking-wide ${
      first ? 'pt-4' : 'border-gray-lighter dark:border-white/10 mt-2 border-t pt-5'
    }`}
  >
    {children}
  </Text>
)

/** Both language pickers on one page (issue #460, layout C): the primary, then the second. */
export const LanguagesSettingsPage = ({
  languages,
  current,
  secondary,
  onSelect,
  onChangeSecondary,
  onBack,
}: LanguagesSettingsPageProps) => {
  const {height: windowHeight} = useWindowDimensions()

  return (
    <View>
      <SettingsSheetHeader title="Languages" icon="back" onPress={onBack} />
      <ScrollView style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}} bounces={false}>
        <SectionLabel first>Language</SectionLabel>
        {languages.map((code) => (
          <Option
            key={code}
            label={name(code)}
            a11yLabel={`Language: ${name(code)}`}
            selected={code === current}
            onPress={() => onSelect(code)}
          />
        ))}
        <SectionLabel>Second language</SectionLabel>
        <Option
          label="None"
          a11yLabel="Second language: None"
          selected={secondary.length === 0}
          onPress={() => onChangeSecondary([])}
        />
        {languages
          .filter((code) => code !== current)
          .map((code) => (
            <Option
              key={code}
              label={name(code)}
              a11yLabel={`Second language: ${name(code)}`}
              selected={secondary.includes(code)}
              onPress={() => onChangeSecondary([code])}
            />
          ))}
      </ScrollView>
    </View>
  )
}
