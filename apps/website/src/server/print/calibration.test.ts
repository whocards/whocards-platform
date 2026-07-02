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

// Bezier curve ops (`c`, one per rounded corner => 4 per card outline) only show up
// for a cornerRadius layout; a square-corner layout's outlines are plain `re`
// (rectangle) ops with none.
const curveCount = (content: string): number =>
  (content.match(/(?:^|\n)[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ c\n/g) ?? []).length

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

  it('produces the right page size for the Avery L7165 sticker sheet (#138)', async () => {
    const bytes = await renderCalibrationPdf({preset: 'avery-l7165', offsetX: 0, offsetY: 0})
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)

    const layout = layoutFor('avery-l7165')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  })

  describe('rounded corners (#138)', () => {
    it('draws a bezier-curved (rounded-rect) outline for a cornerRadius layout, not a plain rectangle', async () => {
      const roundedContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-l7165', offsetX: 0, offsetY: 0})
      )
      const squareContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-5371', offsetX: 0, offsetY: 0})
      )

      expect(curveCount(roundedContent)).toBeGreaterThan(0)
      expect(curveCount(squareContent)).toBe(0)

      const layout = layoutFor('avery-l7165')!
      // 4 curve segments per rounded-rect outline, one outline per card.
      expect(curveCount(roundedContent)).toBe(layout.perPage * 4)
    })

    it('still draws exactly one stroked path per card outline, same as the delta a square-corner layout would add (#139-style check)', async () => {
      // avery-l7165 and a4-85x54-10up share the same A4 page (so the ruler tick count
      // is identical, same trick as the #139 registration-marks test below), so the
      // stroke-count *delta* between them isolates exactly what changes: the outline
      // count (perPage — one `S` per card either way, rounded or square) and the
      // unique-corner count (registration marks, 2 strokes each).
      const rounded = layoutFor('avery-l7165')! // gutter {x: non-zero, y: 0} — cols don't share corners, rows do
      const square = layoutFor('a4-85x54-10up')! // gutter {x: 0, y: 0} — every interior corner is shared

      const roundedContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'avery-l7165', offsetX: 0, offsetY: 0})
      )
      const squareContent = await decodedPageContent(
        await renderCalibrationPdf({preset: 'a4-85x54-10up', offsetX: 0, offsetY: 0})
      )
      expect(rounded.pageSize).toEqual(square.pageSize)

      const roundedCorners = rounded.cols * 2 * (rounded.rows + 1)
      const squareCorners = (square.cols + 1) * (square.rows + 1)
      const outlineDelta = rounded.perPage - square.perPage
      const cornerDelta = roundedCorners - squareCorners
      const expectedStrokeDelta = outlineDelta + cornerDelta * 2

      expect(strokeCount(roundedContent) - strokeCount(squareContent)).toBe(expectedStrokeDelta)
    })
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
