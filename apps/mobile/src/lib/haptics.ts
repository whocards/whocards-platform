import {Platform} from 'react-native'
import * as ExpoHaptics from 'expo-haptics'

/**
 * Web-safe, never-throwing haptics wrapper.
 *
 * On web, all calls are no-ops. On native, errors are swallowed silently so a
 * haptic failure never crashes the UI. expo-haptics already respects the system
 * silent switch and Low Power Mode — no extra handling needed here.
 */

/** Fires a selection-changed haptic (light tap, suitable for card changes). */
export const selection = (): void => {
  if (Platform.OS === 'web') return
  void ExpoHaptics.selectionAsync().catch(() => undefined)
}

type ImpactStyle = 'light' | 'medium' | 'rigid'

const IMPACT_MAP: Record<ImpactStyle, ExpoHaptics.ImpactFeedbackStyle> = {
  light: ExpoHaptics.ImpactFeedbackStyle.Light,
  medium: ExpoHaptics.ImpactFeedbackStyle.Medium,
  rigid: ExpoHaptics.ImpactFeedbackStyle.Rigid,
}

/** Fires an impact haptic at the given weight. */
export const impact = (style: ImpactStyle): void => {
  if (Platform.OS === 'web') return
  void ExpoHaptics.impactAsync(IMPACT_MAP[style]).catch(() => undefined)
}
