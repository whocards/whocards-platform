import {Pressable} from 'react-native'
import type {PressableProps} from 'react-native'
import {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const AnimatedPressable = createAnimatedComponent(Pressable)

const SPRING = {damping: 15, stiffness: 300}

type PressableScaleProps = Pick<
  PressableProps,
  | 'onPress'
  | 'onPressIn'
  | 'onPressOut'
  | 'accessibilityRole'
  | 'accessibilityLabel'
  | 'hitSlop'
  | 'className'
  | 'style'
  | 'children'
  | 'disabled'
>

/**
 * A Pressable that springs its scale to ~0.96 on press and back on release.
 * Uses Reanimated so the spring runs on the UI thread. All standard Pressable
 * accessibility props are forwarded.
 */
export const PressableScale = ({onPress, onPressIn, onPressOut, ...rest}: PressableScaleProps) => {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }))

  const handlePressIn = (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    scale.value = withSpring(0.96, SPRING)
    onPressIn?.(e)
  }

  const handlePressOut = (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    scale.value = withSpring(1, SPRING)
    onPressOut?.(e)
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      {...rest}
    />
  )
}
