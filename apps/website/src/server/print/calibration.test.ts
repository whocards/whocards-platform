import {PDFDocument} from 'pdf-lib'
import {describe, expect, it} from 'vitest'

import {renderCalibrationPdf} from './calibration'
import {layoutFor} from './presets'

// Like render.test.ts, these check what's cheaply verifiable without a rendering
// diff: a single page at the preset's exact size, re-parseable by pdf-lib.

describe('renderCalibrationPdf', () => {
  it('produces a single-page PDF at the preset page size', async () => {
    const bytes = await renderCalibrationPdf({preset: 'avery-5371', offsetX: 0, offsetY: 0})
    expect(bytes.byteLength).toBeGreaterThan(500)

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)

    const layout = layoutFor('avery-5371')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  })

  it('produces the right page size for a different physical layout (A4 85x55)', async () => {
    const bytes = await renderCalibrationPdf({preset: 'sigel-lp798', offsetX: 0, offsetY: 0})
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)

    const layout = layoutFor('sigel-lp798')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  })

  it('applies the mm offset without changing page size/count', async () => {
    const bytes = await renderCalibrationPdf({preset: 'avery-5371', offsetX: 3, offsetY: -2})
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const layout = layoutFor('avery-5371')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  })

  it('resolves a SKU alias just like a physical layout id', async () => {
    const bytes = await renderCalibrationPdf({preset: 'us-letter-10up', offsetX: 0, offsetY: 0})
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('throws for an unknown preset', async () => {
    await expect(
      renderCalibrationPdf({preset: 'not-a-real-sheet', offsetX: 0, offsetY: 0})
    ).rejects.toThrow(/unknown preset/)
  })
})
