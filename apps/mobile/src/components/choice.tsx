import {Host, Picker} from '@expo/ui'
import {colors} from '@whocards/tokens'

export type ChoiceProps<T extends string> = {
  /** Names the setting: the screen reader's label, and the Android dialog's title. */
  label: string
  options: readonly {value: T; label: string}[]
  current: T
  onSelect: (value: T) => void
  enabled?: boolean
  isDark: boolean
}

/** One pick from a list, as the platform does it. Here: iOS's popup menu, which sets the value and closes. */
export const Choice = <T extends string>({
  label,
  options,
  current,
  onSelect,
  enabled,
  isDark,
}: ChoiceProps<T>) => (
  <Host
    matchContents
    colorScheme={isDark ? 'dark' : 'light'}
    seedColor={isDark ? colors.accentOnDark : colors.accentOnLight}
  >
    <Picker
      selectedValue={current}
      onValueChange={onSelect}
      accessibilityLabel={label}
      enabled={enabled}
    >
      {options.map((option) => (
        <Picker.Item key={option.value} label={option.label} value={option.value} />
      ))}
    </Picker>
  </Host>
)
