import {describe, expect, it} from 'vitest'

import {PHYSICAL_LAYOUTS} from '../../server/print/presets'

import {
  buildCalibrationDownloadUrl,
  buildPrintDownloadUrl,
  clampOffsetMm,
  getDefaultPresetId,
  getDisabledLanguageCodes,
  layoutUpCount,
} from './print-ui'

describe('layoutUpCount', () => {
  it('multiplies cols by rows', () => {
    expect(layoutUpCount({cols: 2, rows: 5} as never)).toBe(10)
    expect(layoutUpCount({cols: 2, rows: 4} as never)).toBe(8)
  })
})

describe('getDefaultPresetId', () => {
  it('picks the first supported layout in registry order', () => {
    expect(getDefaultPresetId(PHYSICAL_LAYOUTS)).toBe('us-letter-10up')
  })

  it('skips unsupported layouts', () => {
    const layouts = {
      ...PHYSICAL_LAYOUTS,
      'us-letter-10up': {...PHYSICAL_LAYOUTS['us-letter-10up'], supported: false},
    }
    expect(getDefaultPresetId(layouts)).toBe('a4-85x54-10up')
  })

  it('returns undefined when nothing is supported', () => {
    const layouts = Object.fromEntries(
      Object.entries(PHYSICAL_LAYOUTS).map(([id, layout]) => [id, {...layout, supported: false}])
    ) as typeof PHYSICAL_LAYOUTS
    expect(getDefaultPresetId(layouts)).toBeUndefined()
  })
})

describe('buildPrintDownloadUrl', () => {
  it('builds the query string for the endpoint', () => {
    expect(buildPrintDownloadUrl('library', 'en', 'avery-5371')).toBe(
      '/api/print.pdf?deck=library&lang=en&preset=avery-5371'
    )
  })

  it('encodes SKU aliases with special characters safely', () => {
    const url = buildPrintDownloadUrl('library', 'pt-br', 'us-letter-10up')
    expect(url).toBe('/api/print.pdf?deck=library&lang=pt-br&preset=us-letter-10up')
  })

  it('omits offsetX/offsetY from the query when both are 0 (the default)', () => {
    const url = buildPrintDownloadUrl('library', 'en', 'avery-5371', 0, 0)
    expect(url).toBe('/api/print.pdf?deck=library&lang=en&preset=avery-5371')
  })

  it('includes a nonzero mm offset in the query (#40)', () => {
    const url = buildPrintDownloadUrl('library', 'en', 'avery-5371', 1.5, -2)
    expect(url).toBe('/api/print.pdf?deck=library&lang=en&preset=avery-5371&offsetX=1.5&offsetY=-2')
  })

  it('includes only the nonzero axis when the other is 0', () => {
    const url = buildPrintDownloadUrl('library', 'en', 'avery-5371', 0, 3)
    expect(url).toBe('/api/print.pdf?deck=library&lang=en&preset=avery-5371&offsetY=3')
  })
})

describe('buildCalibrationDownloadUrl', () => {
  it('builds the query string with no offset by default', () => {
    expect(buildCalibrationDownloadUrl('avery-5371')).toBe('/api/calibration.pdf?preset=avery-5371')
  })

  it('includes a nonzero mm offset in the query', () => {
    const url = buildCalibrationDownloadUrl('avery-5371', 1.5, -2)
    expect(url).toBe('/api/calibration.pdf?preset=avery-5371&offsetX=1.5&offsetY=-2')
  })
})

describe('clampOffsetMm', () => {
  it('passes through values within ±20mm unchanged', () => {
    expect(clampOffsetMm(5)).toBe(5)
    expect(clampOffsetMm(-5)).toBe(-5)
    expect(clampOffsetMm(0)).toBe(0)
  })

  it('clamps values beyond the ±20mm calibration range', () => {
    expect(clampOffsetMm(25)).toBe(20)
    expect(clampOffsetMm(-25)).toBe(-20)
  })

  it('falls back to 0 for non-finite input', () => {
    expect(clampOffsetMm(Number.NaN)).toBe(0)
    expect(clampOffsetMm(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('getDisabledLanguageCodes', () => {
  it('returns codes present in all but not in enabled, preserving order', () => {
    expect(getDisabledLanguageCodes(['en', 'he', 'zh', 'jp', 'fr'], ['en', 'fr'])).toEqual([
      'he',
      'zh',
      'jp',
    ])
  })

  it('returns an empty array when everything is enabled', () => {
    expect(getDisabledLanguageCodes(['en', 'fr'], ['en', 'fr'])).toEqual([])
  })
})
