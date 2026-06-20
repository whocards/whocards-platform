import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {useEffect} from 'react'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import Animated, {FadeIn} from 'react-native-reanimated'
import {configureLogger} from '@whocards/logger'
import {colors} from '@whocards/tokens'

// console-in-dev / no-op-in-prod; mobile PostHog transport deferred (ticket 0004)
configureLogger({dev: __DEV__})

import '../global.css'

// Brand faces (golos-text / aptly / noto-sans-hebrew) are embedded natively via the
// expo-font config plugin (app.json), so they're available at launch — no async font
// loading and no flash of fallback. We only hold the splash until the first frame is
// ready, then fade it out.
void SplashScreen.preventAutoHideAsync()

// Fade duration for the splash → landing handoff (ms). Long enough to feel polished,
// short enough not to feel sluggish.
const SPLASH_FADE_MS = 300

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

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
