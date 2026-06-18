/** Severity levels surfaced by this logger. */
export type LogLevel = 'warn' | 'error'

/**
 * Arbitrary key/value context attached to a log entry.
 * PII rule: ids and error messages only — never question text.
 */
export type LogContext = Record<string, unknown>

/** A single log entry passed to sinks and the console transport. */
export type LogEntry = {
  level: LogLevel
  message: string
  error?: Error
  context?: LogContext
}

/** A function that receives structured log entries in production. */
export type LogSink = (entry: LogEntry) => void

/** Runtime configuration for the logger module. */
export type LoggerConfig = {
  dev: boolean
  sink?: LogSink
}

// Module-level state — safe default routes to console so nothing is silently lost
// before the app calls configureLogger.
let config: LoggerConfig = {dev: true}

/** Replace the active logger configuration. Call once at app startup. */
export const configureLogger = (next: LoggerConfig): void => {
  config = next
}

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

/* oxlint-disable no-console */
const toConsole = (entry: LogEntry): void => {
  const args: unknown[] = [entry.message]
  if (entry.error !== undefined) args.push(entry.error)
  if (entry.context !== undefined) args.push(entry.context)
  if (entry.level === 'error') {
    console.error(...args)
  } else {
    console.warn(...args)
  }
}
/* oxlint-enable no-console */

const emit = (level: LogLevel, message: string, error?: Error, context?: LogContext): void => {
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

    if (config.dev) {
      toConsole(entry)
    } else if (config.sink !== undefined) {
      config.sink(entry)
    }
    // prod + no sink → intentional no-op
  } catch {
    // logging must never throw — swallow silently
  }
}

/** Log a warning. Safe to call from any context; never throws. */
export const logWarn = (message: string, error?: unknown, context?: LogContext): void => {
  emit('warn', message, toError(error), context)
}

/** Log an error. Safe to call from any context; never throws. */
export const logError = (message: string, error?: unknown, context?: LogContext): void => {
  emit('error', message, toError(error), context)
}
