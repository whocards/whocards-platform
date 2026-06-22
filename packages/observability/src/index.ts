/** Severity levels surfaced by this logger. */
export type LogLevel = 'warn' | 'error'

/**
 * Arbitrary key/value context attached to a log entry.
 * PII rule: ids and error messages only — never question text.
 */
export type LogContext = Record<string, unknown>

/** A single log entry passed to providers. */
export type LogEntry = {
  level: LogLevel
  message: string
  error?: Error
  context?: LogContext
}

/** A function that receives structured log entries in production (legacy compat). */
export type LogSink = (entry: LogEntry) => void

/** Arbitrary event name (snake_case by convention). */
export type EventName = string

/** Arbitrary event properties (snake_case keys by convention). */
export type EventProps = Record<string, unknown>

/** A typed event ready to be emitted. */
export type ObsEvent = {name: EventName; props?: EventProps}

/**
 * Provider interface — apps implement this once and hand it to
 * `configureObservability`. All methods must never throw.
 */
export type ObservabilityProvider = {
  captureError(entry: LogEntry): void
  captureEvent(name: EventName, props?: EventProps): void
  identify(id: string, props?: EventProps): void
  reset?(): void
}

/** Runtime configuration for the observability module. */
export type ObsConfig = {
  dev: boolean
  provider?: ObservabilityProvider
}

// ---------------------------------------------------------------------------
// Built-in console provider (used in dev, injectable for tests)
// ---------------------------------------------------------------------------

/* oxlint-disable no-console */
export const consoleProvider: ObservabilityProvider = {
  captureError(entry: LogEntry): void {
    const args: unknown[] = [entry.message]
    if (entry.error !== undefined) args.push(entry.error)
    if (entry.context !== undefined) args.push(entry.context)
    if (entry.level === 'error') {
      console.error(...args)
    } else {
      console.warn(...args)
    }
  },
  captureEvent(name: EventName, props?: EventProps): void {
    if (props !== undefined) {
      console.log('[obs]', name, props)
    } else {
      console.log('[obs]', name)
    }
  },
  identify(id: string, props?: EventProps): void {
    if (props !== undefined) {
      console.log('[obs:identify]', id, props)
    } else {
      console.log('[obs:identify]', id)
    }
  },
}
/* oxlint-enable no-console */

// ---------------------------------------------------------------------------
// Module-level state — safe default routes to console so nothing is silently
// lost before the app calls configureObservability.
// ---------------------------------------------------------------------------

let activeConfig: ObsConfig = {dev: true}

/** Replace the active observability configuration. Call once at app startup. */
export const configureObservability = (next: ObsConfig): void => {
  activeConfig = next
}

// ---------------------------------------------------------------------------
// Sanitize seam — pass-through now; will become a PII scrubber when
// Custom Decks / accounts land. Route all event/error props through this.
// ---------------------------------------------------------------------------

/** Pass-through sanitizer seam. Replace with a real scrubber when PII exists. */
export const sanitize = (props: EventProps): EventProps => props

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const getProvider = (): ObservabilityProvider | undefined => {
  if (activeConfig.dev) return consoleProvider
  return activeConfig.provider
}

// ---------------------------------------------------------------------------
// Core public API
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown caught value to an Error (or undefined when there is nothing
 * meaningful to report). Handles: undefined/null → undefined; Error → as-is;
 * anything else → new Error(String(value)).
 */
export const toError = (value: unknown): Error | undefined => {
  if (value === undefined || value === null) return undefined
  if (value instanceof Error) return value
  return new Error(String(value))
}

const emitEntry = (level: LogLevel, message: string, error?: Error, context?: LogContext): void => {
  try {
    // Build entry without assigning `undefined` to optional fields so the
    // object is safe under exactOptionalPropertyTypes.
    const entry: LogEntry =
      error !== undefined && context !== undefined
        ? {level, message, error, context}
        : error !== undefined
          ? {level, message, error}
          : context !== undefined
            ? {level, message, context}
            : {level, message}

    getProvider()?.captureError(entry)
  } catch {
    // logging must never throw — swallow silently
  }
}

/** Log a warning. Safe to call from any context; never throws. */
export const logWarn = (message: string, error?: unknown, context?: LogContext): void => {
  emitEntry('warn', message, toError(error), context)
}

/** Log an error. Safe to call from any context; never throws. */
export const logError = (message: string, error?: unknown, context?: LogContext): void => {
  emitEntry('error', message, toError(error), context)
}

/** Emit a named event. Safe to call from any context; never throws. */
export const trackEvent = (name: EventName, props?: EventProps): void => {
  try {
    const sanitized = props !== undefined ? sanitize(props) : undefined
    if (sanitized !== undefined) {
      getProvider()?.captureEvent(name, sanitized)
    } else {
      getProvider()?.captureEvent(name)
    }
  } catch {
    // tracking must never throw — swallow silently
  }
}

/** Identify the current user/device. Safe to call from any context; never throws. */
export const identify = (id: string, props?: EventProps): void => {
  try {
    if (props !== undefined) {
      getProvider()?.identify(id, sanitize(props))
    } else {
      getProvider()?.identify(id)
    }
  } catch {
    // identify must never throw — swallow silently
  }
}
