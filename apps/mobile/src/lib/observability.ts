import PostHog from 'posthog-react-native'
import {configureObservability} from '@whocards/observability'
import type {LogEntry, ObservabilityProvider} from '@whocards/observability'

// Same PostHog project as the website (EXPO_PUBLIC_ prefix so Expo inlines it into
// the client bundle). Mobile talks to PostHog directly — native apps aren't subject
// to the browser ad-blockers the web reverse-proxy works around — so the host
// defaults to the EU ingestion endpoint, overridable via env.
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

// In dev we keep PostHog off and route to the console provider so local play never
// pollutes the project. Set EXPO_PUBLIC_POSTHOG_DEBUG=1 to force the real transport
// on in a dev build (emulator/device testing). Release builds always send. This one
// flag drives BOTH the client `disabled` state and the core dev/console routing
// below, so explicit events and autocapture flip together.
const debug = process.env.EXPO_PUBLIC_POSTHOG_DEBUG === '1'
const sendToPostHog = !__DEV__ || debug

/**
 * The app's PostHog client, or `undefined` when no key is configured. Disabled
 * unless we're sending (release, or dev with EXPO_PUBLIC_POSTHOG_DEBUG=1). Mounted
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

// posthog-react-native types properties as JSON values; our EventProps is the wider
// Record<string, unknown>. Cast at this boundary — the values are runtime JSON and
// PostHog serializes them — using the SDK's own param type so it stays in sync.
type PHProps = Parameters<PostHog['capture']>[1]

// Mirrors apps/website/src/lib/observability.ts: errors → captureException (or an
// app_log event when there's no Error), events → capture, identify → identify.
const provider: ObservabilityProvider = {
  captureError(entry: LogEntry): void {
    const {message, level, error, context} = entry
    if (error !== undefined) {
      posthog?.captureException(error, {message, level, ...context})
    } else {
      posthog?.capture('app_log', {message, level, ...context})
    }
  },
  captureEvent(name: string, props?: Record<string, unknown>): void {
    posthog?.capture(name, props as PHProps)
  },
  identify(id: string, props?: Record<string, unknown>): void {
    posthog?.identify(id, props as PHProps)
  },
  reset(): void {
    // TODO(accounts): call on logout / account-claim to re-key the PostHog person.
    posthog?.reset()
  },
}

/**
 * Wire the PostHog provider into @whocards/observability. dev → the core's built-in
 * console provider; release → this PostHog provider. Call once at app startup.
 */
export const initObservability = (): void => {
  // `dev:false` routes explicit events through the PostHog provider; `dev:true` uses
  // the console provider. Tied to sendToPostHog so the debug flag flips routing and
  // the client together (otherwise explicit events would still go to console in dev).
  configureObservability({dev: !sendToPostHog, provider})
}
