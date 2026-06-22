import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {PostHogProvider} from 'posthog-react-native'
import {useEffect} from 'react'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {identify} from '@whocards/observability'
import {colors} from '@whocards/tokens'

import {ErrorBoundary} from '@/components/error-boundary'
import {getDeviceId} from '@/lib/device-id'
import {initObservability, posthog} from '@/lib/observability'

// dev → console (core default); release → PostHog. Must run before identify().
initObservability()

// Identify this device so all events share a stable distinct_id.
// getDeviceId() is async on mobile (AsyncStorage backed).
void getDeviceId().then((id) => identify(id))

import '../global.css'

// Brand faces (golos-text / aptly / noto-sans-hebrew) are embedded natively via the
// expo-font config plugin (app.json), so they're available at launch. The landing
// screen runs the splash → content handoff (the logo animates from the splash's
// centre into place) and hides the splash itself; this is only a backstop so a deep
// link straight to the player can't get stuck on the splash if the landing never mounts.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    const fallback = setTimeout(() => void SplashScreen.hideAsync(), 1500)
    return () => clearTimeout(fallback)
  }, [])

  const content = (
    <ErrorBoundary>
      <Stack
        screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.darkest}}}
      />
    </ErrorBoundary>
  )

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      {/* Default bar: light (white icons) over the dark landing and player screens.
          The language modal overrides this to dark while the white sheet is visible. */}
      <StatusBar style="light" />
      {/* PostHog autocapture (touches + screens) wraps the navigator — only when a
          client exists (key configured). The client itself is disabled in dev. */}
      {posthog ? (
        <PostHogProvider
          client={posthog}
          autocapture={{captureTouches: true, captureScreens: true}}
        >
          {content}
        </PostHogProvider>
      ) : (
        content
      )}
    </GestureHandlerRootView>
  )
}
