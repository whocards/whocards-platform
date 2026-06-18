import {afterEach, describe, expect, it, vi} from 'vitest'
import {configureLogger, logError, logWarn, toError} from './index'

afterEach(() => {
  vi.restoreAllMocks()
  configureLogger({dev: true})
})

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
})

describe('prod mode + sink → sink receives entry (not console)', () => {
  it('calls sink and does NOT call console when in prod', () => {
    const sink = vi.fn()
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configureLogger({dev: false, sink})

    logWarn('prod warning')

    expect(sink).toHaveBeenCalledOnce()
    expect(consoleSpy).not.toHaveBeenCalled()

    const entry = sink.mock.calls[0]?.[0]
    expect(entry?.level).toBe('warn')
    expect(entry?.message).toBe('prod warning')
  })

  it('passes error and context to sink', () => {
    const sink = vi.fn()
    configureLogger({dev: false, sink})
    const err = new Error('boom')

    logError('prod error', err, {attempt: 1})

    const entry = sink.mock.calls[0]?.[0]
    expect(entry?.error).toBe(err)
    expect(entry?.context).toEqual({attempt: 1})
  })
})

describe('prod mode + no sink → no-op', () => {
  it('does not throw and does not call console when no sink in prod', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configureLogger({dev: false})

    expect(() => logWarn('silent')).not.toThrow()
    expect(consoleSpy).not.toHaveBeenCalled()
  })
})

const explosiveSink = (): void => {
  throw new Error('sink exploded')
}

describe('never throws even when sink throws', () => {
  it('swallows sink errors', () => {
    configureLogger({dev: false, sink: explosiveSink})

    expect(() => logError('this should not propagate')).not.toThrow()
  })
})

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
