import type {ReactNode} from 'react'
import {useMemo} from 'react'
import type {PressableProps, StyleProp, ViewStyle} from 'react-native'
import {Gesture, GestureDetector} from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const SPRING = {damping: 15, stiffness: 300}
const PRESSED_SCALE = 0.96

type PressableScaleProps = Pick<
  PressableProps,
  'accessibilityRole' | 'accessibilityLabel' | 'hitSlop' | 'disabled'
> & {
  className?: string
  onPress?: () => void
  // plain forms (Pressable's style/children also allow a render fn, which Animated.View rejects)
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}

/**
 * A pressable that springs its scale to ~0.96 on press and back on release.
 * Press detection runs on the UI thread via `Gesture.Tap` so the scale spring
 * never makes a JS-thread round-trip (animation-gesture-detector-press); `onPress`
 * is bridged back with `runOnJS`. Shared values use `.get()`/`.set()` for React
 * Compiler compatibility. `onAccessibilityTap` keeps screen-reader activation
 * working (a gesture alone doesn't fire on a VoiceOver/TalkBack double-tap).
 */
export const PressableScale = ({
  onPress,
  hitSlop,
  style,
  disabled,
  children,
  ...accessibility
}: PressableScaleProps) => {
  // press state: 0 = released, 1 = pressed. Scale is derived from it.
  const pressed = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: interpolate(pressed.get(), [0, 1], [1, PRESSED_SCALE])}],
  }))

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .enabled(disabled !== true)
      // allow a little finger travel before the tap is cancelled
      .maxDistance(20)
      .onBegin(() => {
        'worklet'
        pressed.set(withSpring(1, SPRING))
      })
      // fires on success AND cancel, so the scale always springs back
      .onFinalize(() => {
        'worklet'
        pressed.set(withSpring(0, SPRING))
      })
      .onEnd(() => {
        'worklet'
        if (onPress) runOnJS(onPress)()
      })
    if (hitSlop != null) tap.hitSlop(hitSlop as number)
    return tap
  }, [onPress, disabled, hitSlop, pressed])

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        onAccessibilityTap={onPress}
        // animatedStyle last so a caller-supplied `style` can't clobber the scale spring
        style={[style, animatedStyle]}
        {...accessibility}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
}
