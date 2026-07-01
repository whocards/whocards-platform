import {inflateSync} from 'node:zlib'

import {PDFArray, PDFDocument, PDFRawStream} from 'pdf-lib'
import {describe, expect, it} from 'vitest'

import {renderCalibrationPdf} from './calibration'
import {layoutFor} from './presets'

// Like render.test.ts, these check what's cheaply verifiable without a rendering
// diff: a single page at the preset's exact size, re-parseable by pdf-lib.

/**
 * Re-parses a rendered PDF's single page and inflates its (FlateDecode-compressed,
 * pdf-lib's default) content stream back to the raw operator text, so tests can
 * assert on what got drawn — e.g. how many stroked paths (`S` operators, one per
 * `drawLine`/`drawRectangle` call) the registration marks add — without needing a
 * pixel-level rendering diff.
 */
const decodedPageContent = async (bytes: Uint8Array): Promise<string> => {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPage(0).node.Contents()
  if (contents instanceof PDFArray) {
    const stream = contents.lookup(0, PDFRawStream)
    return inflateSync(Buffer.from(stream.getContents())).toString('latin1')
  }
  if (!(contents instanceof PDFRawStream)) throw new Error('expected a raw content stream')
  return inflateSync(Buffer.from(contents.getContents())).toString('latin1')
}

/** Number of stroked paths in a decoded content stream — each is an `S` operator alone on its line. */
const strokeCount = (content: string): number => (content.match(/(?:^|\n)S(?=\n|$)/g) ?? []).length

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

  describe('registration marks (#139)', () => {
    it('draws one crosshair (2 strokes) per unique grid corner, on top of the card outlines', async () => {
      // Both presets share the same US Letter page (so the ruler tick count is
      // identical) but different grids, so the stroke-count delta isolates exactly
      // what the outlines + registration marks contribute:
      //   outlines: one stroke per card (cols * rows)
      //   marks: one crosshair (2 strokes) per unique corner ((cols+1) * (rows+1),
      //          since these gutter-less grids share corners between adjacent cards)
      const tenUp = layoutFor('avery-5371')!
      const eightUp = layoutFor('us-letter-cleanedge-8up')!
      expect(tenUp.pageSize).toEqual(eightUp.pageSize)

      const tenUpContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-5371', offsetX: 0, offsetY: 0})
      )
      const eightUpContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'us-letter-cleanedge-8up', offsetX: 0, offsetY: 0})
      )

      const outlineDelta = tenUp.cols * tenUp.rows - eightUp.cols * eightUp.rows
      const cornerDelta =
        (tenUp.cols + 1) * (tenUp.rows + 1) - (eightUp.cols + 1) * (eightUp.rows + 1)
      const expectedStrokeDelta = outlineDelta + cornerDelta * 2

      expect(strokeCount(tenUpContent) - strokeCount(eightUpContent)).toBe(expectedStrokeDelta)
    })

    it('moves the registration marks with the mm offset, same as the outlines', async () => {
      const unshifted = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-5371', offsetX: 0, offsetY: 0})
      )
      const shifted = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-5371', offsetX: 5, offsetY: -3})
      )

      // Same number of drawn paths either way (the offset only translates them)...
      expect(strokeCount(shifted)).toBe(strokeCount(unshifted))
      // ...but the actual coordinates differ, proving the marks aren't hard-coded
      // to the unshifted grid.
      expect(shifted).not.toBe(unshifted)
    })
  })
})
