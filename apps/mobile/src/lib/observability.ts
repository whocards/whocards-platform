import * as Device from 'expo-device'
import PostHog from 'posthog-react-native'
import {configureObservability, consoleProvider} from '@whocards/observability'
import type {LogEntry, ObservabilityProvider} from '@whocards/observability'

import {env} from '@/env'

// Same PostHog project as the website (EXPO_PUBLIC_ prefix so Expo inlines it into
// the client bundle). Mobile talks to PostHog directly — native apps aren't subject
// to the browser ad-blockers the web reverse-proxy works around — so the host
// defaults to the EU ingestion endpoint, overridable via env.
const apiKey = env.EXPO_PUBLIC_POSTHOG_KEY
const host = env.EXPO_PUBLIC_POSTHOG_HOST

// In dev we keep PostHog off and route to the console provider so local play never
// pollutes the project. Set EXPO_PUBLIC_DEBUG=true to force the real transport on in
// a dev build (emulator/device testing) AND tee every event to the console. Release
// builds always send. This one flag drives the client `disabled` state, the core
// dev/console routing, and the console tee below, so everything flips together.
const debug = env.EXPO_PUBLIC_DEBUG
const sendToPostHog = !__DEV__ || debug

/**
 * The app's PostHog client, or `undefined` when no key is configured. Disabled
 * unless we're sending (release, or dev with EXPO_PUBLIC_DEBUG=true). Mounted
 * into the tree by `PostHogProvider` (app root) for autocapture.
 */
export const posthog =
  apiKey !== undefined && apiKey !== ''
    ? new PostHog(apiKey, {
        host,
        disabled: !sendToPostHog,
        captureAppLifecycleEvents: true,
        enableSessionReplay: false,
      })
    : undefined

// Release builds on non-real hardware — simulators/emulators, including the
// Maestro flows `pnpm release:check` drives (issue #178) — send events that
// are otherwise indistinguishable from a real player's, once sendToPostHog is
// true. Flag rather than drop: a dropped event is gone for good, a flagged one
// stays debuggable and is one PostHog "Filter out internal and test users"
// rule away from being excluded from insights. `register()` persists this
// super property in PostHog's own local storage, so it rides on every future
// `capture()` call (this session and every later one) with nothing more to do
// here — see `setInternalMarker` below for the manual counterpart used on the
// 2 physical dev phones, which this check can't reach.
if (posthog && !Device.isDevice) {
  void posthog.register({is_internal: true})
}

// posthog-react-native types properties as JSON values; our EventProps is the wider
// Record<string, unknown>. Cast at this boundary — the values are runtime JSON and
// PostHog serializes them — using the SDK's own param type so it stays in sync.
type PHProps = Parameters<PostHog['capture']>[1]

// Mirrors apps/website/src/lib/observability.ts: errors → captureException (or an
// app_log event when there's no Error), events → capture, identify → identify.
const posthogProvider: ObservabilityProvider = {
  captureError(entry: LogEntry): void {
    const {message, level, error, context} = entry
    if (error !== undefined) {
      posthog?.captureException(error, {message, level, ...context})
    } else {
      posthog?.capture('app_log', {message, level, ...context})
    }
  },
  captureEvent(name: string, props?: Record<string, unknown>): void {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ObservabilityProvider's EventProps is Record<string, unknown>; PostHog's PHProps requires JSON-serialisable values. Callers only ever pass JSON-safe event props.
    posthog?.capture(name, props as PHProps)
  },
  identify(id: string, props?: Record<string, unknown>): void {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same JsonType boundary as captureEvent above.
    posthog?.identify(id, props as PHProps)
  },
  reset(): void {
    // TODO(accounts): call on logout / account-claim to re-key the PostHog person.
    posthog?.reset()
  },
}

/** Fan each call out to several providers — used to tee PostHog to the console under debug. */
const teeProvider = (...providers: ObservabilityProvider[]): ObservabilityProvider => ({
  captureError: (entry) => providers.forEach((p) => p.captureError(entry)),
  captureEvent: (name, props) => providers.forEach((p) => p.captureEvent(name, props)),
  identify: (id, props) => providers.forEach((p) => p.identify(id, props)),
  reset: () => providers.forEach((p) => p.reset?.()),
})

/**
 * Wire the PostHog provider into @whocards/observability. Call once at app startup.
 * - release (or EXPO_PUBLIC_DEBUG): events go to PostHog;
 * - EXPO_PUBLIC_DEBUG also tees every event to the console;
 * - plain dev: the core's built-in console provider only.
 */
export const initObservability = (): void => {
  if (debug) {
    configureObservability({dev: false, provider: teeProvider(posthogProvider, consoleProvider)})
  } else {
    // `dev:false` routes explicit events through PostHog; `dev:true` uses the console
    // provider. Tied to sendToPostHog so the client `disabled` state and routing agree.
    configureObservability({dev: !sendToPostHog, provider: posthogProvider})
  }
}

/**
 * Manually flip the `is_internal` PostHog super property (issue #178) — the
 * escape hatch for the owner's physical dev phones, which — unlike a
 * simulator/emulator (the `Device.isDevice` check above) — can't be
 * auto-detected. Wired to a long-press on the Library wordmark; see
 * use-internal-marker.ts. `register`/`unregister` both persist locally, so
 * the choice survives app restarts without any boot-time restore of their own
 * (use-internal-marker.ts still restores our own AsyncStorage flag on mount,
 * for the UI's benefit, and re-applies it here as a cheap, idempotent safety
 * net).
 */
export const setInternalMarker = (internal: boolean): void => {
  if (internal) {
    void posthog?.register({is_internal: true})
  } else {
    void posthog?.unregister('is_internal')
  }
}
