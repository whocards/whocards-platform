import {describe, expect, it} from 'vitest'

import {parseImagePlaygroundCardParams} from './params'

const search = (query: Record<string, string | undefined>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  return params
}

const valid = {language: 'en', id: '1', size: 'og'}

describe('parseImagePlaygroundCardParams', () => {
  it('accepts a minimal valid query, defaulting every override to unset', () => {
    const result = parseImagePlaygroundCardParams(search(valid))
    expect(result).toEqual({
      ok: true,
      value: {
        language: 'en',
        id: '1',
        size: 'og',
        sizeOverrides: {
          padding: undefined,
          wordmarkScale: undefined,
          fontScale: undefined,
          verticalAlign: undefined,
          rtlJustify: undefined,
        },
        cardOutline: false,
        theme: 'dark',
      },
    })
  })

  it('accepts story and post as size values', () => {
    expect(parseImagePlaygroundCardParams(search({...valid, size: 'story'})).ok).toBe(true)
    expect(parseImagePlaygroundCardParams(search({...valid, size: 'post'})).ok).toBe(true)
  })

  it('rejects a missing language', () => {
    const result = parseImagePlaygroundCardParams(search({id: '1', size: 'og'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('language is required')
  })

  it('rejects a missing id', () => {
    const result = parseImagePlaygroundCardParams(search({language: 'en', size: 'og'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('id is required')
  })

  it('rejects an unknown size', () => {
    const result = parseImagePlaygroundCardParams(search({...valid, size: 'banner'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('size must be one of')
  })

  it('parses numeric overrides', () => {
    const result = parseImagePlaygroundCardParams(
      search({...valid, padding: '20', wordmarkScale: '1.2', fontScale: '0.8'})
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.sizeOverrides.padding).toBe(20)
    expect(result.ok && result.value.sizeOverrides.wordmarkScale).toBe(1.2)
    expect(result.ok && result.value.sizeOverrides.fontScale).toBe(0.8)
  })

  it('rejects a non-numeric padding', () => {
    const result = parseImagePlaygroundCardParams(search({...valid, padding: 'huge'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('padding must be a finite number')
  })

  it('rejects an out-of-range padding', () => {
    const result = parseImagePlaygroundCardParams(search({...valid, padding: '99999'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('padding must be between')
  })

  it('rejects an invalid verticalAlign', () => {
    const result = parseImagePlaygroundCardParams(search({...valid, verticalAlign: 'middle'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('verticalAlign must be one of')
  })

  it('parses cardOutline and theme', () => {
    const result = parseImagePlaygroundCardParams(
      search({...valid, cardOutline: 'true', theme: 'light'})
    )
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.cardOutline).toBe(true)
    expect(result.ok && result.value.theme).toBe('light')
  })

  it('rejects an invalid cardOutline value', () => {
    const result = parseImagePlaygroundCardParams(search({...valid, cardOutline: 'yes'}))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('cardOutline must be')
  })
})
