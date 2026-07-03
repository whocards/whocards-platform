import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
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
  iconColor: string
}

/** One bottom-bar action: icon over a small label, sharing equal width with its peers. */
const BarButton = ({icon, label, onPress, accessibilityLabel, iconColor}: BarButtonProps) => {
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
      <Ionicons name={icon} size={24} color={iconColor} />
      <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-xs">{label}</Text>
    </PressableScale>
  )
}

type PlayerBarProps = {
  /** Hide Share while there is no card to share (e.g. the pick screen before a deal). */
  showShare?: boolean
  onPrevious: () => void
  onNext: () => void
  onShare: () => void
  /** Leave the player — same handler the old top-right close chip called (issue #186). */
  onExit: () => void
}

/**
 * The player's bottom action bar: a translucent toolbar of icon+label actions
 * (the home for per-card actions like favorite / thumbs-down later). Navigation lives at
 * the edges (thumb-reachable), card actions in the middle. Each action takes an equal
 * share of the width, so the bar stays balanced as more are added.
 *
 * Themed (issue #173): this bar is chrome around the always-dark Card, not the
 * Card itself, so — like the Library screen and every sheet (issue #163) — it
 * follows the Theme Display setting rather than always being dark.
 *
 * Exit lives here now (issue #186), not as a floating top-right chip — it sits
 * right after Back. Used to also carry a Language/Display button that opened
 * the in-play language sheet (issue #148); issue #176 moved every setting
 * (Language, Tabletop mode, Game, Theme) into one Settings menu reachable only
 * from the home screen — the play screens have no settings entry of their own
 * anymore, so the bar reads Prev · Exit · Share · Next.
 */
export const PlayerBar = ({
  showShare = true,
  onPrevious,
  onNext,
  onShare,
  onExit,
}: PlayerBarProps) => {
  const insets = useSafeAreaInsets()
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

  return (
    <View
      className="border-darker/10 bg-white/90 flex-row items-stretch border-t px-4 pt-2 dark:border-white/10 dark:bg-darker/80"
      style={{paddingBottom: Math.max(insets.bottom, 10)}}
    >
      <BarButton
        icon="chevron-back"
        label="Back"
        onPress={onPrevious}
        accessibilityLabel="previous question"
        iconColor={iconColor}
      />
      <BarButton
        icon="close-outline"
        label="Exit"
        onPress={onExit}
        accessibilityLabel="exit deck"
        iconColor={iconColor}
      />
      {showShare ? (
        <BarButton
          icon="share-outline"
          label="Share"
          onPress={onShare}
          accessibilityLabel="share question"
          iconColor={iconColor}
        />
      ) : null}
      <BarButton
        icon="chevron-forward"
        label="Next"
        onPress={onNext}
        accessibilityLabel="next question"
        iconColor={iconColor}
      />
    </View>
  )
}
