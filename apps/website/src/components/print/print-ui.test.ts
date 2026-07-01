import {describe, expect, it} from 'vitest'

import {PHYSICAL_LAYOUTS} from '../../server/print/presets'

import {
  buildPrintDownloadUrl,
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
