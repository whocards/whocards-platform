import {Ionicons} from '@expo/vector-icons'
import {Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import {PressableScale} from '@/components/pressable-scale'
import {impact} from '@/lib/haptics'

type IconName = keyof typeof Ionicons.glyphMap

type BarButtonProps = {
  icon: IconName
  label: string
  onPress: () => void
  accessibilityLabel?: string
}

/** One bottom-bar action: icon over a small label, sharing equal width with its peers. */
const BarButton = ({icon, label, onPress, accessibilityLabel}: BarButtonProps) => {
  const handlePress = () => {
    impact('light')
    onPress()
  }

  return (
    <PressableScale
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      className="flex-1 items-center gap-1 py-1"
    >
      <Ionicons name={icon} size={24} color={colors.white} />
      <Text className="text-gray-dark font-sans text-xs">{label}</Text>
    </PressableScale>
  )
}

type PlayerBarProps = {
  showLanguage: boolean
  onPrevious: () => void
  onNext: () => void
  onShare: () => void
  onLanguage: () => void
}

/**
 * The player's bottom action bar: a translucent dark toolbar of icon+label actions
 * (the home for per-card actions like favorite / thumbs-down later). Navigation lives at
 * the edges (thumb-reachable), card actions in the middle. Each action takes an equal
 * share of the width, so the bar stays balanced as more are added.
 */
export const PlayerBar = ({
  showLanguage,
  onPrevious,
  onNext,
  onShare,
  onLanguage,
}: PlayerBarProps) => {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="flex-row items-stretch border-t border-white/10 bg-darker/80 px-4 pt-2"
      style={{paddingBottom: Math.max(insets.bottom, 10)}}
    >
      <BarButton
        icon="chevron-back"
        label="Back"
        onPress={onPrevious}
        accessibilityLabel="previous question"
      />
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
      <BarButton
        icon="chevron-forward"
        label="Next"
        onPress={onNext}
        accessibilityLabel="next question"
      />
    </View>
  )
}
