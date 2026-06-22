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
}
