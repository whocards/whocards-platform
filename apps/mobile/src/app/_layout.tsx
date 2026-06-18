import {useFonts} from 'expo-font'
import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {useEffect} from 'react'
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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'golos-text': require('../../assets/fonts/golos-text.ttf'),
    aptly: require('../../assets/fonts/aptly.ttf'),
    'noto-sans-hebrew': require('../../assets/fonts/noto-sans-hebrew.ttf'),
  })

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.darkest}}}
      />
    </GestureHandlerRootView>
  )
}
