import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {colorScheme, useColorScheme} from 'nativewind'
import {PostHogProvider} from 'posthog-react-native'
import {useEffect} from 'react'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {identify} from '@whocards/observability'
import {colors} from '@whocards/tokens'

import {ErrorBoundary} from '@/components/error-boundary'
import {getDeviceId} from '@/lib/device-id'
import {initObservability, posthog} from '@/lib/observability'
import {getStoredTheme} from '@/lib/theme-store'

// dev → console (core default); release → PostHog. Must run before identify().
initObservability()

// Identify this device so all events share a stable distinct_id.
// getDeviceId() is async on mobile (AsyncStorage backed).
void getDeviceId().then((id) => identify(id))

// Restore a previously-chosen Theme override as early as possible (issue #163,
// a Display setting — CONTEXT.md), before the first paint that could show the
// wrong scheme. NativeWind already follows the OS Appearance out of the box
// with nothing called (`colorScheme.get()` falls back to it), so this only
// needs to act when the player has an explicit stored override; calling
// `colorScheme.set('system')` for the (common) unset/default case is a no-op
// in effect, just an explicit one.
void getStoredTheme().then((stored) => colorScheme.set(stored))

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

  // This is the color that shows through the gap during a Stack screen transition.
  // Previously hardcoded to `darkest` because Play/Pick a Card forced dark regardless
  // of the Theme setting (amendment 2) — that justification dissolved once issue #173
  // themed those screens' chrome too, so every screen now themes and this gap color
  // just follows suit, live, via NativeWind's `colorScheme`.
  const {colorScheme: resolvedScheme} = useColorScheme()
  const isDark = resolvedScheme !== 'light'
  const navigator = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: isDark ? colors.darkest : colors.canvasLight},
      }}
    />
  )

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      {/* Fallback default before any screen mounts its own override — every screen
          that actually themes (Library, Play, Pick a Card) sets its own local
          `<StatusBar>` (expo-status-bar: "last mounted wins, revert on unmount"),
          so this only matters for the brief window before one of those mounts. */}
      <StatusBar style="light" />
      {/* ErrorBoundary outermost so it catches render throws from anywhere below,
          including PostHogProvider itself. PostHog autocapture wraps the navigator
          only when a client exists (key configured); the client is disabled in dev.

          captureScreens is OFF: PostHogProvider mounts ABOVE expo-router's navigation
          container, so its screen-tracking hook can't find a navigation object and
          throws "Couldn't find a navigation object" — non-fatal on iOS but a white
          screen on Android release. Screen/view events are already captured explicitly
          via `track()` in the player (deck_opened, question_shown, dwell), so touch
          autocapture is all we take from the provider. */}
      <ErrorBoundary>
        {posthog ? (
          <PostHogProvider
            client={posthog}
            autocapture={{captureTouches: true, captureScreens: false}}
          >
            {navigator}
          </PostHogProvider>
        ) : (
          navigator
        )}
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
