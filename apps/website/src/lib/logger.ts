import {configureLogger} from '@whocards/logger'
import type {LogEntry} from '@whocards/logger'

const sink = (entry: LogEntry): void => {
  const {message, level, error, context} = entry
  if (error !== undefined) {
    window.posthog?.captureException(error, {message, level, ...context})
  } else {
    window.posthog?.capture('app_log', {message, level, ...context})
  }
}

export const initWebLogger = (): void => {
  configureLogger({dev: import.meta.env.DEV, sink})
}
