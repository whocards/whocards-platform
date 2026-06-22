import {afterEach, describe, expect, it, vi} from 'vitest'
import type {ObservabilityProvider, LogEntry, EventProps} from './index'
import {
  configureObservability,
  logError,
  logWarn,
  toError,
  trackEvent,
  identify,
  sanitize,
} from './index'

afterEach(() => {
  vi.restoreAllMocks()
  // reset to dev mode so subsequent tests start clean
  configureObservability({dev: true})
})

// ---------------------------------------------------------------------------
// Dev mode → console provider
// ---------------------------------------------------------------------------

describe('dev mode → console', () => {
  it('logWarn routes to console.warn in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarn('test warning')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toBe('test warning')
  })

  it('logError routes to console.error in dev', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('test error')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toBe('test error')
  })

  it('passes the error object to console in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = new Error('boom')
    logWarn('with error', err)
    expect(spy).toHaveBeenCalledWith('with error', err)
  })

  it('trackEvent routes to console.log in dev', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    trackEvent('deck_opened', {deck_id: 'friends'})
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[1]).toBe('deck_opened')
  })

  it('identify routes to console.log in dev', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    identify('device-123')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[1]).toBe('device-123')
  })
})

// ---------------------------------------------------------------------------
// Prod mode + provider → provider receives calls (not console)
// ---------------------------------------------------------------------------

describe('prod mode + provider → provider receives calls (not console)', () => {
  it('logError routes to captureError and does NOT call console', () => {
    const provider: ObservabilityProvider = {
      captureError: vi.fn(),
      captureEvent: vi.fn(),
      identify: vi.fn(),
    }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    configureObservability({dev: false, provider})

    logError('prod error')

    expect(provider.captureError).toHaveBeenCalledOnce()
    expect(consoleSpy).not.toHaveBeenCalled()

    const entry = (provider.captureError as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as LogEntry
    expect(entry?.level).toBe('error')
    expect(entry?.message).toBe('prod error')
  })

  it('logWarn routes to captureError with warn level', () => {
    const provider: ObservabilityProvider = {
      captureError: vi.fn(),
      captureEvent: vi.fn(),
      identify: vi.fn(),
    }
    configureObservability({dev: false, provider})

    logWarn('prod warning', new Error('boom'), {attempt: 1})

    const entry = (provider.captureError as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as LogEntry
    expect(entry?.level).toBe('warn')
    expect(entry?.error).toBeInstanceOf(Error)
    expect(entry?.context).toEqual({attempt: 1})
  })

  it('trackEvent routes to captureEvent', () => {
    const provider: ObservabilityProvider = {
      captureError: vi.fn(),
      captureEvent: vi.fn(),
      identify: vi.fn(),
    }
    configureObservability({dev: false, provider})

    trackEvent('game_started', {deck_id: 'friends', game: 'wh', language: 'en'})

    expect(provider.captureEvent).toHaveBeenCalledOnce()
    const [name, props] = (provider.captureEvent as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      EventProps,
    ]
    expect(name).toBe('game_started')
    expect(props).toEqual({deck_id: 'friends', game: 'wh', language: 'en'})
  })

  it('identify routes to provider.identify', () => {
    const provider: ObservabilityProvider = {
      captureError: vi.fn(),
      captureEvent: vi.fn(),
      identify: vi.fn(),
    }
    configureObservability({dev: false, provider})

    identify('device-abc', {plan: 'free'})

    expect(provider.identify).toHaveBeenCalledOnce()
    const [id, props] = (provider.identify as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      EventProps,
    ]
    expect(id).toBe('device-abc')
    expect(props).toEqual({plan: 'free'})
  })
})

// ---------------------------------------------------------------------------
// Prod mode + no provider → no-op
// ---------------------------------------------------------------------------

describe('prod mode + no provider → no-op', () => {
  it('does not throw and does not call console when no provider in prod', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configureObservability({dev: false})

    expect(() => logWarn('silent')).not.toThrow()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('trackEvent is a no-op in prod with no provider', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    configureObservability({dev: false})

    expect(() => trackEvent('deck_opened')).not.toThrow()
    expect(consoleSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Never throws even when provider throws
// ---------------------------------------------------------------------------

describe('never throws even when provider throws', () => {
  it('swallows captureError throws', () => {
    const provider: ObservabilityProvider = {
      captureError: () => {
        throw new Error('provider exploded')
      },
      captureEvent: vi.fn(),
      identify: vi.fn(),
    }
    configureObservability({dev: false, provider})

    expect(() => logError('this should not propagate')).not.toThrow()
  })

  it('swallows captureEvent throws', () => {
    const provider: ObservabilityProvider = {
      captureError: vi.fn(),
      captureEvent: () => {
        throw new Error('event exploded')
      },
      identify: vi.fn(),
    }
    configureObservability({dev: false, provider})

    expect(() => trackEvent('deck_opened')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// sanitize — pass-through
// ---------------------------------------------------------------------------

describe('sanitize — pass-through seam', () => {
  it('returns props unchanged', () => {
    const props: EventProps = {deck_id: 'friends', language: 'en'}
    expect(sanitize(props)).toBe(props)
  })
})

// ---------------------------------------------------------------------------
// toError — non-Error value normalisation
// ---------------------------------------------------------------------------

describe('toError — non-Error value normalisation', () => {
  it('returns undefined for undefined', () => {
    expect(toError(undefined)).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(toError(null)).toBeUndefined()
  })

  it('passes Error through unchanged', () => {
    const err = new Error('original')
    expect(toError(err)).toBe(err)
  })

  it('wraps a string in a new Error', () => {
    const result = toError('something went wrong')
    expect(result).toBeInstanceOf(Error)
    expect(result?.message).toBe('something went wrong')
  })

  it('wraps a number in a new Error', () => {
    const result = toError(404)
    expect(result).toBeInstanceOf(Error)
    expect(result?.message).toBe('404')
  })
})
