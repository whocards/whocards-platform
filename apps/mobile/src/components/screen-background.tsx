import {Image} from 'expo-image'
import {useColorScheme} from 'nativewind'
import type {ReactNode} from 'react'
import {StyleSheet, View} from 'react-native'
import type {SharedValue} from 'react-native-reanimated'
import Animated, {useAnimatedStyle} from 'react-native-reanimated'
import {colors} from '@whocards/tokens'

// Rasterized from the website's public/background.svg (the bg-hero texture).
// Dark is the original (dark-only) asset; light is a recolored variant for the
// Theme Display setting (issue #163) — see docs/design/163-light-mode/proposal.md.
const textureDark = require('../../assets/images/background.png')
const textureLight = require('../../assets/images/background-light.png')

type ScreenBackgroundProps = {
  children: ReactNode
  /** optional 0–1 opacity for the texture (e.g. to fade it in on first launch) */
  textureOpacity?: SharedValue<number>
  /**
   * Force the dark canvas regardless of the Theme Display setting (issue #163,
   * amendment: the Card is the brand object and stays dark in both themes).
   * Classic play has no separate card frame — the Question sits directly on
   * this background, so the "card" and the "canvas" are the same surface —
   * DeckPlayer passes `forceDark` so it never themes. The Library screen (the
   * only other caller) omits this and follows the Theme setting normally.
   */
  forceDark?: boolean
}

/**
 * Full-screen WhoCards backdrop: the brand hero texture over a solid base. Uses
 * expo-image (memory-efficient decode + cache) absolutely filled behind the
 * content, since expo-image has no `ImageBackground` equivalent. The base colour
 * is always painted, so a `textureOpacity` fade reveals the texture over the
 * solid base. Follows the Theme Display setting unless `forceDark` is set.
 */
export const ScreenBackground = ({children, textureOpacity, forceDark}: ScreenBackgroundProps) => {
  const {colorScheme} = useColorScheme()
  const isDark = forceDark ?? colorScheme !== 'light'

  const textureStyle = useAnimatedStyle(() => ({
    opacity: textureOpacity ? textureOpacity.get() : 1,
  }))

  return (
    <View style={{flex: 1, backgroundColor: isDark ? colors.darkest : colors.canvasLight}}>
      <Animated.View style={[StyleSheet.absoluteFill, textureStyle]} pointerEvents="none">
        <Image
          source={isDark ? textureDark : textureLight}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {children}
    </View>
  )
}
