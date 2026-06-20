import {Image} from 'expo-image'
import type {ReactNode} from 'react'
import {StyleSheet, View} from 'react-native'
import {colors} from '@whocards/tokens'

// Rasterized from the website's public/background.svg (the bg-hero texture).
const texture = require('../../assets/images/background.png')

type ScreenBackgroundProps = {children: ReactNode}

/**
 * Full-screen WhoCards backdrop: the web's dark hero texture over the darkest base.
 * Uses expo-image (memory-efficient decode + cache) absolutely filled behind the
 * content, since expo-image has no `ImageBackground` equivalent.
 */
export const ScreenBackground = ({children}: ScreenBackgroundProps) => (
  <View style={{flex: 1, backgroundColor: colors.darkest}}>
    <Image source={texture} contentFit="cover" style={StyleSheet.absoluteFill} />
    {children}
  </View>
)
