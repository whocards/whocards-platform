import {configureObservability} from '@whocards/observability'
import type {LogEntry, ObservabilityProvider} from '@whocards/observability'

const provider: ObservabilityProvider = {
  captureError(entry: LogEntry): void {
    const {message, level, error, context} = entry
    if (error !== undefined) {
      window.posthog?.captureException(error, {message, level, ...context})
    } else {
      window.posthog?.capture('app_log', {message, level, ...context})
    }
  },
  captureEvent(name: string, props?: Record<string, unknown>): void {
    window.posthog?.capture(name, props)
  },
  identify(id: string, props?: Record<string, unknown>): void {
    window.posthog?.identify(id, props)
  },
}

export const initObservability = (): void => {
  configureObservability({dev: import.meta.env.DEV, provider})
  // `platform` as a super property (not a per-event prop — see the doc
  // comment on DeckOpenedProps et al. in @whocards/observability/events) so
  // every event this session sends carries it without every call site
  // repeating it. Mirrors apps/mobile/src/lib/observability.ts.
  window.posthog?.register({platform: 'web'})
}
