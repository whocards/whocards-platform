import {Ionicons} from '@expo/vector-icons'
import {Pressable, Text} from 'react-native'
import {colors} from '@whocards/tokens'

type IconName = keyof typeof Ionicons.glyphMap

type ControlButtonProps = {
  onPress: () => void
  accessibilityLabel: string
  /** A native glyph, or — for the language pill — a short text `label` instead. */
  icon?: IconName
  label?: string
  disabled?: boolean
}

/**
 * The single circular control used across the player's bottom bar, so Prev / Next /
 * Language / Exit all share one size, surface and pressed state (44pt touch target).
 */
export const ControlButton = ({
  onPress,
  accessibilityLabel,
  icon,
  label,
  disabled = false,
}: ControlButtonProps) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    hitSlop={8}
    className={`h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 active:bg-white/20 ${
      disabled ? 'opacity-30' : ''
    }`}
  >
    {icon ? (
      <Ionicons name={icon} size={22} color={colors.white} />
    ) : (
      <Text className="text-sm font-semibold uppercase text-white">{label}</Text>
    )}
  </Pressable>
)
