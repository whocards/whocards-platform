import {Ionicons} from '@expo/vector-icons'
import {GlassView, isLiquidGlassAvailable} from 'expo-glass-effect'
import {Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {colors} from '@whocards/tokens'

import {PressableScale} from '@/components/pressable-scale'
import {useIsDark} from '@/lib/color-scheme'
import {impact} from '@/lib/haptics'
import {useT} from '@/lib/i18n'

type IconName = keyof typeof Ionicons.glyphMap

type BarButtonProps = {
  icon: IconName
  label: string
  onPress: () => void
  accessibilityLabel?: string
  iconColor: string
  disabled?: boolean
}

/** One bottom-bar action: icon over a small label, sharing equal width with its peers. */
const BarButton = ({
  icon,
  label,
  onPress,
  accessibilityLabel,
  iconColor,
  disabled = false,
}: BarButtonProps) => {
  const handlePress = () => {
    impact('light')
    onPress()
  }

  return (
    <PressableScale
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={disabled ? {disabled} : undefined}
      disabled={disabled}
      hitSlop={6}
      className={`flex-1 items-center gap-1 py-1 ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={24} color={iconColor} />
      <Text className="text-mutedOnLight dark:text-gray-dark font-sans text-xs">{label}</Text>
    </PressableScale>
  )
}

type PlayerBarProps = {
  /** Share is disabled while there is no card to share (e.g. the pick screen before a deal). */
  shareDisabled?: boolean
  onPrevious: () => void
  onNext: () => void
  onShare: () => void
  /** Open the in-play Settings sheet (issue #197). */
  onSettings: () => void
  /** Leave the player — same handler the old top-right close chip called (issue #186). */
  onExit: () => void
}

/**
 * The player's bottom action bar: a floating pill (Liquid Glass where iOS has it, translucent
 * elsewhere) of icon+label actions
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
 * (Language, Tabletop mode, Game, Theme) into one Settings menu, which the gear opens.
 */
export const PlayerBar = ({
  shareDisabled = false,
  onPrevious,
  onNext,
  onShare,
  onSettings,
  onExit,
}: PlayerBarProps) => {
  const insets = useSafeAreaInsets()
  const isDark = useIsDark()
  const iconColor = isDark ? colors.white : colors.darker
  const t = useT()

  const buttons = (
    <>
      <BarButton
        icon="chevron-back"
        label={t('bar.back')}
        onPress={onPrevious}
        accessibilityLabel={t('a11y.previousQuestion')}
        iconColor={iconColor}
      />
      <BarButton
        icon="close-outline"
        label={t('bar.exit')}
        onPress={onExit}
        accessibilityLabel={t('a11y.exitDeck')}
        iconColor={iconColor}
      />
      <BarButton
        icon="settings-outline"
        label={t('bar.settings')}
        onPress={onSettings}
        accessibilityLabel={t('a11y.openSettings')}
        iconColor={iconColor}
      />
      <BarButton
        icon="share-outline"
        label={t('bar.share')}
        onPress={onShare}
        accessibilityLabel={t('a11y.shareQuestion')}
        iconColor={iconColor}
        disabled={shareDisabled}
      />
      <BarButton
        icon="chevron-forward"
        label={t('bar.next')}
        onPress={onNext}
        accessibilityLabel={t('a11y.nextQuestion')}
        iconColor={iconColor}
      />
    </>
  )

  return (
    <View className="px-4 pt-2" style={{paddingBottom: Math.max(insets.bottom, 10)}}>
      {isLiquidGlassAvailable() ? (
        <GlassView
          colorScheme={isDark ? 'dark' : 'light'}
          style={{
            flexDirection: 'row',
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          {buttons}
        </GlassView>
      ) : (
        <View className="border-darker/10 bg-white/90 flex-row rounded-full border px-3 py-2 dark:border-white/10 dark:bg-darker/80">
          {buttons}
        </View>
      )}
    </View>
  )
}
