import {Image} from 'expo-image'
import type {ReactNode} from 'react'
import {StyleSheet, View} from 'react-native'
import type {SharedValue} from 'react-native-reanimated'
import Animated, {useAnimatedStyle} from 'react-native-reanimated'
import {colors} from '@whocards/tokens'

// Rasterized from the website's public/background.svg (the bg-hero texture).
const texture = require('../../assets/images/background.png')

type ScreenBackgroundProps = {
  children: ReactNode
  /** optional 0–1 opacity for the texture (e.g. to fade it in on first launch) */
  textureOpacity?: SharedValue<number>
}

/**
 * Full-screen WhoCards backdrop: the web's dark hero texture over the darkest base.
 * Uses expo-image (memory-efficient decode + cache) absolutely filled behind the
 * content, since expo-image has no `ImageBackground` equivalent. The base colour is
 * always painted, so a `textureOpacity` fade reveals the texture over solid darkest.
 */
export const ScreenBackground = ({children, textureOpacity}: ScreenBackgroundProps) => {
  const textureStyle = useAnimatedStyle(() => ({
    opacity: textureOpacity ? textureOpacity.get() : 1,
  }))

  return (
    <View style={{flex: 1, backgroundColor: colors.darkest}}>
      <Animated.View style={[StyleSheet.absoluteFill, textureStyle]} pointerEvents="none">
        <Image source={texture} contentFit="cover" style={StyleSheet.absoluteFill} />
      </Animated.View>
      {children}
    </View>
  )
}
