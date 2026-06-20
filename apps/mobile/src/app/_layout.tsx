import {useFonts} from 'expo-font'
import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {useEffect, useState} from 'react'
import Animated, {FadeIn} from 'react-native-reanimated'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {configureLogger} from '@whocards/logger'
import {colors} from '@whocards/tokens'

// console-in-dev / no-op-in-prod; mobile PostHog transport deferred (ticket 0004)
configureLogger({dev: __DEV__})

import '../global.css'

// Hold the native splash until the brand faces are ready, so text never flashes
// in a fallback font. Keys match the @whocards/tokens families (golos-text / aptly),
// which is what NativeWind's `font-sans` / `font-title` resolve to.
void SplashScreen.preventAutoHideAsync()

// Fade duration for the splash → landing handoff (ms). Long enough to feel polished,
// short enough not to feel sluggish.
const SPLASH_FADE_MS = 300

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'golos-text': require('../../assets/fonts/golos-text.ttf'),
    aptly: require('../../assets/fonts/aptly.ttf'),
    'noto-sans-hebrew': require('../../assets/fonts/noto-sans-hebrew.ttf'),
  })
  // Tracks whether the splash has been hidden so we render only after the fade
  // would have started, avoiding a flash on the first frame.
  const [splashHidden, setSplashHidden] = useState(false)

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync().then(() => {
        setSplashHidden(true)
      })
    }
  }, [fontsLoaded])

  if (!fontsLoaded || !splashHidden) return null

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      {/* Default bar: light (white icons) over the dark landing and player screens.
          The language modal overrides this to dark while the white sheet is visible. */}
      <StatusBar style="light" />
      <Animated.View style={{flex: 1}} entering={FadeIn.duration(SPLASH_FADE_MS)}>
        <Stack
          screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.darkest}}}
        />
      </Animated.View>
    </GestureHandlerRootView>
  )
}
