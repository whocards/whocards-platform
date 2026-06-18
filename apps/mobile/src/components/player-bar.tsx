import {Ionicons} from '@expo/vector-icons'
import {Pressable, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

type IconName = keyof typeof Ionicons.glyphMap

type BarButtonProps = {
  icon: IconName
  label: string
  onPress: () => void
  accessibilityLabel?: string
}

/** One bottom-bar action: icon over a small label, sharing equal width with its peers. */
const BarButton = ({icon, label, onPress, accessibilityLabel}: BarButtonProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    hitSlop={6}
    className="flex-1 items-center gap-1 py-1 active:opacity-60"
  >
    <Ionicons name={icon} size={24} color={colors.white} />
    <Text className="text-gray-dark font-sans text-xs">{label}</Text>
  </Pressable>
)

type PlayerBarProps = {
  showLanguage: boolean
  onShare: () => void
  onLanguage: () => void
}

/**
 * The player's bottom action bar: a translucent dark toolbar of icon+label actions
 * (the home for per-card actions like favorite / thumbs-down later). Each action takes
 * an equal share of the width, so the bar stays balanced as more are added.
 */
export const PlayerBar = ({showLanguage, onShare, onLanguage}: PlayerBarProps) => {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="flex-row items-stretch border-t border-white/10 bg-darker/80 px-4 pt-2"
      style={{paddingBottom: Math.max(insets.bottom, 10)}}
    >
      <BarButton
        icon="share-outline"
        label="Share"
        onPress={onShare}
        accessibilityLabel="share question"
      />
      {showLanguage ? (
        <BarButton
          icon="language"
          label="Language"
          onPress={onLanguage}
          accessibilityLabel="change language"
        />
      ) : null}
    </View>
  )
}
