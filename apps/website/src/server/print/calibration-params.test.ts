import {describe, expect, it} from 'vitest'

import {parseCalibrationParams} from './calibration-params'

const search = (query: Record<string, string | undefined>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  return params
}

describe('parseCalibrationParams', () => {
  it('accepts a preset with no offsets, defaulting both to 0', () => {
    const result = parseCalibrationParams(search({preset: 'avery-5371'}))
    expect(result).toEqual({ok: true, value: {preset: 'avery-5371', offsetX: 0, offsetY: 0}})
  })

  it('resolves a SKU alias preset just like a physical layout id', () => {
    const result = parseCalibrationParams(search({preset: 'us-letter-10up'}))
    expect(result.ok).toBe(true)
  })

  it('parses offsetX/offsetY as mm floats', () => {
    const result = parseCalibrationParams(
      search({preset: 'avery-5371', offsetX: '1.5', offsetY: '-2'})
    )
    expect(result).toEqual({
      ok: true,
      value: {preset: 'avery-5371', offsetX: 1.5, offsetY: -2},
    })
  })

  it('rejects a missing preset', () => {
    const result = parseCalibrationParams(search({}))
    expect(result).toEqual({ok: false, error: expect.stringContaining('preset is required')})
  })

  it('rejects an unknown preset', () => {
    const result = parseCalibrationParams(search({preset: 'not-a-real-sheet'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining('unknown preset')})
  })

  it('rejects an un-calibrated ("supported: false") preset', () => {
    const result = parseCalibrationParams(search({preset: 'us-letter-cleanedge-8up'}))
    expect(result).toEqual({ok: false, error: expect.stringContaining("isn't supported yet")})
  })

  it('rejects an un-calibrated preset via its SKU alias too', () => {
    const result = parseCalibrationParams(search({preset: 'avery-8859'}))
    expect(result.ok).toBe(false)
  })

  it('rejects an offsetX/offsetY that is not a finite number', () => {
    const result = parseCalibrationParams(search({preset: 'avery-5371', offsetX: 'nope'}))
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('offsetX must be a finite number'),
    })
  })

  it('rejects an offset beyond the ±20mm calibration range', () => {
    const result = parseCalibrationParams(search({preset: 'avery-5371', offsetY: '100'}))
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('offsetY must be within ±20mm'),
    })
  })
})
