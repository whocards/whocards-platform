import {describe, expect, it} from 'vitest'

import {parsePrintParams, PRINT_LANGUAGES} from './params'

const search = (query: Record<string, string | undefined>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  return params
}

const valid = {deck: 'library', lang: 'en', preset: 'avery-5371'}

describe('parsePrintParams', () => {
  it('accepts a fully valid query', () => {
    const result = parsePrintParams(search(valid))
    expect(result).toEqual({
      ok: true,
      value: {deck: 'library', lang: 'en', preset: 'avery-5371', offsetX: 0, offsetY: 0},
    })
  })

  it('resolves a SKU alias preset just like a physical layout id', () => {
    const result = parsePrintParams(search({...valid, preset: 'us-letter-10up'}))
    expect(result.ok).toBe(true)
  })

  it('parses offsetX/offsetY as mm floats', () => {
    const result = parsePrintParams(search({...valid, offsetX: '1.5', offsetY: '-2'}))
    expect(result).toEqual({
      ok: true,
      value: {deck: 'library', lang: 'en', preset: 'avery-5371', offsetX: 1.5, offsetY: -2},
    })
  })

  it('defaults missing offsets to 0', () => {
    const result = parsePrintParams(search(valid))
    expect(result.ok && result.value.offsetX).toBe(0)
    expect(result.ok && result.value.offsetY).toBe(0)
  })

  it('rejects a deck other than library', () => {
    const result = parsePrintParams(search({...valid, deck: 'ai-at-work'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining('deck must be "library"')})
  })

  it('rejects a missing deck', () => {
    const result = parsePrintParams(search({lang: 'en', preset: 'avery-5371'}))
    expect(result.ok).toBe(false)
  })

  it('exposes all 14 Pool languages, including he/zh/jp (RTL + CJK, #41)', () => {
    expect(PRINT_LANGUAGES).toContain('en')
    expect(PRINT_LANGUAGES).toContain('sr') // Cyrillic
    expect(PRINT_LANGUAGES).toContain('he') // RTL
    expect(PRINT_LANGUAGES).toContain('zh') // CJK
    expect(PRINT_LANGUAGES).toContain('jp') // CJK
    expect(PRINT_LANGUAGES).toHaveLength(14)
  })

  it('accepts Hebrew, Mandarin and Japanese (RTL/CJK support landed in #41)', () => {
    for (const lang of ['he', 'zh', 'jp']) {
      const result = parsePrintParams(search({...valid, lang}))
      expect(result.ok).toBe(true)
    }
  })

  it('rejects an unknown lang code', () => {
    const result = parsePrintParams(search({...valid, lang: 'xx'}))
    expect(result.ok).toBe(false)
  })

  it('rejects a missing preset', () => {
    const result = parsePrintParams(search({deck: 'library', lang: 'en'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining('preset is required')})
  })

  it('rejects an unknown preset', () => {
    const result = parsePrintParams(search({...valid, preset: 'not-a-real-sheet'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining('unknown preset')})
  })

  // presets.ts deliberately lets `resolveLayout`/`layoutFor` resolve an
  // unsupported (un-calibrated) layout like the clean-edge 8-up sheet — it's
  // this endpoint's job to refuse to render it rather than ship untrusted
  // geometry.
  it('rejects an un-calibrated ("supported: false") preset', () => {
    const result = parsePrintParams(search({...valid, preset: 'us-letter-cleanedge-8up'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining("isn't supported yet")})
  })

  it('rejects an un-calibrated preset via its SKU alias too', () => {
    const result = parsePrintParams(search({...valid, preset: 'avery-8859'}))
    expect(result.ok).toBe(false)
  })

  it('rejects an offsetX/offsetY that is not a finite number', () => {
    const result = parsePrintParams(search({...valid, offsetX: 'nope'}))
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('offsetX must be a finite number'),
    })
  })

  it('rejects an offset beyond the ±20mm calibration range', () => {
    const result = parsePrintParams(search({...valid, offsetY: '100'}))
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('offsetY must be within ±20mm'),
    })
  })
})
