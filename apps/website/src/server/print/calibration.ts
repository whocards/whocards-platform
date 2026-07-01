// Per-preset calibration sheet renderer (epic #19, ticket #40). Draws the exact
// card grid outlines from `layoutFor()` (the same geometry #38's print.pdf renders
// cards onto) plus mm ruler ticks along the page edges and a short "how to
// calibrate" instructions block, so a user can print it, lay it over their precut
// sheet, and read off any drift as an X/Y mm offset.
//
// Deliberately independent of ./render's custom font/logo loading (the aptly/
// golos/Noto woff2 files + logo-plain.svg rasterised via resvg, read from disk at
// request time) — a calibration sheet is pure vector geometry + labels, so it only
// needs pdf-lib's built-in Helvetica (StandardFonts), no font-file reads and
// therefore no dependency on that Netlify file-bundling path at all.

import {PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage} from 'pdf-lib'

import type {CalibrationPdfParams} from './calibration-params'
import {layoutFor, mm, PT_PER_MM, type Rect, type Size} from './presets'
import {wrapToWidth} from './text-fit'

const GRID_COLOR = rgb(0.06, 0.06, 0.09)
const RULER_COLOR = rgb(0.35, 0.35, 0.4)
const TEXT_COLOR = rgb(0.06, 0.06, 0.09)

const HAIRLINE_WIDTH = 0.5 // pt, card outlines + ruler baselines
const RULER_MINOR_MM = 5 // minor tick every 5mm
const RULER_MAJOR_MM = 10 // numbered tick every 10mm
const RULER_MINOR_LEN = 3 // pt
const RULER_MAJOR_LEN = 6 // pt
const RULER_FONT_SIZE = 6
const RULER_INSET = 2 // pt, ruler baseline inset from the page edge

const HEADER_FONT_SIZE = 7
const INSTRUCTIONS_FONT_SIZE = 6.5
const TEXT_LINE_HEIGHT_MULTIPLIER = 1.3
const TEXT_MARGIN = 8 // pt, inset for the header/instructions block

const INSTRUCTIONS =
  'Print at 100% ("actual size" — turn off "Fit to page"). Lay this sheet over your ' +
  'precut sheet and compare the card outlines to the mm rulers along the top and left ' +
  'edges; enter any drift you read off as the X/Y offset (mm) and re-download to confirm ' +
  'it lines up.'

/** One card slot outline, in the same top-down coordinate space as `layoutFor`'s rects. */
const drawCardOutline = (page: PDFPage, rect: Rect, pageHeight: number): void => {
  page.drawRectangle({
    x: rect.x,
    y: pageHeight - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
    borderColor: GRID_COLOR,
    borderWidth: HAIRLINE_WIDTH,
  })
}

/**
 * A horizontal mm ruler just inside the page's top edge: minor ticks every 5mm, a
 * numbered major tick every 10mm, spanning the full page width. It's anchored to the
 * page — not the (possibly offset) grid — so it reads an absolute position; comparing
 * where the grid outlines land against it is exactly how a user reads off drift.
 */
const drawTopRuler = (page: PDFPage, pageSize: Size, font: PDFFont): void => {
  const y = pageSize.height - RULER_INSET
  page.drawLine({
    start: {x: 0, y},
    end: {x: pageSize.width, y},
    thickness: HAIRLINE_WIDTH,
    color: RULER_COLOR,
  })
  const maxMm = Math.floor(pageSize.width / PT_PER_MM)
  for (let m = 0; m <= maxMm; m += RULER_MINOR_MM) {
    const x = mm(m)
    const major = m % RULER_MAJOR_MM === 0
    const tickLen = major ? RULER_MAJOR_LEN : RULER_MINOR_LEN
    page.drawLine({
      start: {x, y},
      end: {x, y: y - tickLen},
      thickness: HAIRLINE_WIDTH,
      color: RULER_COLOR,
    })
    if (major) {
      page.drawText(String(m), {
        x: x + 1,
        y: y - tickLen - RULER_FONT_SIZE,
        size: RULER_FONT_SIZE,
        font,
        color: TEXT_COLOR,
      })
    }
  }
}

/** Same idea as `drawTopRuler`, along the page's left edge, ticking down the page height. */
const drawLeftRuler = (page: PDFPage, pageSize: Size, font: PDFFont): void => {
  const x = RULER_INSET
  page.drawLine({
    start: {x, y: pageSize.height},
    end: {x, y: 0},
    thickness: HAIRLINE_WIDTH,
    color: RULER_COLOR,
  })
  const maxMm = Math.floor(pageSize.height / PT_PER_MM)
  for (let m = 0; m <= maxMm; m += RULER_MINOR_MM) {
    const y = pageSize.height - mm(m) // mm(m) = distance down from the top edge
    const major = m % RULER_MAJOR_MM === 0
    const tickLen = major ? RULER_MAJOR_LEN : RULER_MINOR_LEN
    page.drawLine({
      start: {x, y},
      end: {x: x + tickLen, y},
      thickness: HAIRLINE_WIDTH,
      color: RULER_COLOR,
    })
    if (major && m > 0) {
      page.drawText(String(m), {
        x: x + tickLen + 1,
        y: y - RULER_FONT_SIZE / 2,
        size: RULER_FONT_SIZE,
        font,
        color: TEXT_COLOR,
      })
    }
  }
}

/**
 * Preset id + offsets, then the "how to calibrate" copy, stacked top-down in the
 * page's bottom margin (the same margin `layoutFor` derives above the grid, since
 * the centred grid makes the top and bottom margins equal).
 */
const drawFooterText = (
  page: PDFPage,
  pageSize: Size,
  font: PDFFont,
  params: CalibrationPdfParams
): void => {
  const maxWidth = pageSize.width - TEXT_MARGIN * 2
  const instructionLines = wrapToWidth(INSTRUCTIONS, font, INSTRUCTIONS_FONT_SIZE, maxWidth)
  const lineHeight = HEADER_FONT_SIZE * TEXT_LINE_HEIGHT_MULTIPLIER

  const header = `Preset: ${params.preset}  ·  offsetX: ${params.offsetX}mm  ·  offsetY: ${params.offsetY}mm`
  const lines: Array<{text: string; size: number}> = [
    {text: header, size: HEADER_FONT_SIZE},
    ...instructionLines.map((text) => ({text, size: INSTRUCTIONS_FONT_SIZE})),
  ]

  let y = TEXT_MARGIN + (lines.length - 1) * lineHeight
  for (const line of lines) {
    page.drawText(line.text, {x: TEXT_MARGIN, y, size: line.size, font, color: TEXT_COLOR})
    y -= lineHeight
  }
}

/**
 * Render the calibration sheet for already-validated `params`. Throws if the preset
 * can't resolve — callers are expected to have run `parseCalibrationParams` first,
 * so that should only happen if the two modules drift out of sync.
 */
export const renderCalibrationPdf = async (params: CalibrationPdfParams): Promise<Uint8Array> => {
  const layout = layoutFor(params.preset)
  if (!layout) throw new Error(`unknown preset: ${params.preset}`)

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const {pageSize, cardRects} = layout
  const page = doc.addPage([pageSize.width, pageSize.height])

  const offsetXPt = mm(params.offsetX)
  const offsetYPt = mm(params.offsetY)
  for (const rect of cardRects) {
    drawCardOutline(page, {...rect, x: rect.x + offsetXPt, y: rect.y + offsetYPt}, pageSize.height)
  }

  drawTopRuler(page, pageSize, font)
  drawLeftRuler(page, pageSize, font)
  drawFooterText(page, pageSize, font, params)

  return doc.save()
}
