import {Pressable, Text, View} from 'react-native'

type SegmentedControlProps<T extends string> = {
  /** Prefixes each option's accessibility label: `${label}: ${option label}`. */
  label: string
  options: readonly {value: T; label: string}[]
  current: T
  onSelect: (value: T) => void
}

/** An inline choice between a few options, as on the Settings sheet (issue #460). */
export const SegmentedControl = <T extends string>({
  label,
  options,
  current,
  onSelect,
}: SegmentedControlProps<T>) => (
  <View className="bg-gray-lighter dark:bg-white/10 flex-row rounded-xl p-1">
    {options.map((option) => {
      const selected = option.value === current
      return (
        <Pressable
          key={option.value}
          onPress={() => onSelect(option.value)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${option.label}`}
          accessibilityState={{selected}}
          className={`items-center rounded-lg px-3.5 py-2 ${selected ? 'bg-white dark:bg-dark' : ''}`}
          style={selected ? styles.selectedShadow : undefined}
        >
          <Text
            className={`text-darker dark:text-white font-sans text-sm ${selected ? 'font-bold' : ''}`}
          >
            {option.label}
          </Text>
        </Pressable>
      )
    })}
  </View>
)

// NativeWind's shadow utilities target web CSS; a small native shadow lifts the selected segment.
const styles = {
  selectedShadow: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
} as const
