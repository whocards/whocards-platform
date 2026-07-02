// Per-preset "test print" renderer (epic #19, tickets #40/#139). Draws the exact
// card grid outlines from `layoutFor()` (the same geometry #38's print.pdf renders
// cards onto), corner registration marks (standard print-shop crosshairs), mm ruler
// ticks along the page edges, and a short instructions block, so a user can print
// it on plain paper, lay it over their precut sheet (or hold it to the light), and
// read off any drift as an X/Y mm offset before spending a real sheet on the deck.
//
// Deliberately independent of ./render's custom font/logo loading (the aptly/
// golos/Noto woff2 files + logo-plain.svg rasterised via resvg, read from disk at
// request time) — a test print is pure vector geometry + labels, so it only
// needs pdf-lib's built-in Helvetica (StandardFonts), no font-file reads and
// therefore no dependency on that Netlify file-bundling path at all.

import {PDFDocument, StandardFonts, rgb} from 'pdf-lib'
import type {PDFFont, PDFPage} from 'pdf-lib'

import type {CalibrationPdfParams} from './calibration-params'
import {layoutFor, mm, PT_PER_MM} from './presets'
import type {Rect, Size} from './presets'
import {wrapToWidth} from './text-fit'

const GRID_COLOR = rgb(0.06, 0.06, 0.09)
const RULER_COLOR = rgb(0.35, 0.35, 0.4)
const TEXT_COLOR = rgb(0.06, 0.06, 0.09)

const HAIRLINE_WIDTH = 0.5 // pt, card outlines + ruler baselines
const REG_MARK_LEN_MM = 3 // mm, each arm's half-length from the corner point
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
  'Print at 100% ("actual size" — turn off "Fit to page") on plain paper. Hold it over your ' +
  'precut sheet, or up to the light, and compare the card outlines and corner marks to the ' +
  'mm rulers along the top and left edges; enter any drift you read off as the X/Y offset ' +
  '(mm), then download your deck with the same offset.'

/**
 * SVG path (in a local top-down coordinate space, origin at the rect's own top-left
 * corner) for a `width` × `height` rounded rect with corner radius `r` — the standard
 * four-arc recipe, wound clockwise to match ordinary y-down SVG path conventions.
 */
const roundedRectPath = (width: number, height: number, r: number): string =>
  `M ${r},0 H ${width - r} A ${r},${r} 0 0 1 ${width},${r} V ${height - r} ` +
  `A ${r},${r} 0 0 1 ${width - r},${height} H ${r} A ${r},${r} 0 0 1 0,${height - r} ` +
  `V ${r} A ${r},${r} 0 0 1 ${r},0 Z`

/**
 * One card slot outline, in the same top-down coordinate space as `layoutFor`'s rects.
 * Kiss-cut label stock (`cornerRadius` set, e.g. Avery L7165 — see ./presets) draws a
 * true rounded rect via `drawSvgPath`: pdf-lib has no rounded-rect primitive, but
 * `drawSvgPath` already shells out to a full arc-to-bézier SVG path parser, so reusing
 * it beats hand-rolling the bézier corners here. `drawSvgPath` flips the path's local
 * y-axis (SVG convention: y grows downward) and places the path's local origin at
 * (options.x, options.y) — passing the rect's *top* edge (in pdf-lib's bottom-up space)
 * as `y` makes the path's own top-down-authored coordinates land in the right place.
 */
const drawCardOutline = (
  page: PDFPage,
  rect: Rect,
  pageHeight: number,
  cornerRadius: number
): void => {
  if (cornerRadius > 0) {
    page.drawSvgPath(roundedRectPath(rect.width, rect.height, cornerRadius), {
      x: rect.x,
      y: pageHeight - rect.y,
      borderColor: GRID_COLOR,
      borderWidth: HAIRLINE_WIDTH,
    })
    return
  }
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
 * The four corners of a card rect, converted to pdf-lib's bottom-up page space with
 * the same `pageHeight - y` flip `drawCardOutline` uses, so a registration mark lands
 * exactly on its outline's corner.
 *
 * Deliberately unchanged for rounded-corner (kiss-cut) layouts: the mark still lands
 * on the *nominal* grid corner — the point the straight edges would meet at — not
 * pulled in to the curve's tangent point. That nominal corner is exactly what the same
 * grid math (`layoutFor`) derives the margins from, so it's the more useful alignment
 * reference; the rounded outline drawn alongside it already shows where the real curve
 * starts.
 */
const rectCorners = (rect: Rect, pageHeight: number): Array<{x: number; y: number}> => {
  const top = pageHeight - rect.y
  const bottom = pageHeight - rect.y - rect.height
  return [
    {x: rect.x, y: top},
    {x: rect.x + rect.width, y: top},
    {x: rect.x, y: bottom},
    {x: rect.x + rect.width, y: bottom},
  ]
}

/**
 * A small hairline crosshair centred on (x, y) — the standard print-shop registration
 * mark. Drawn once per *unique* grid corner (adjacent, gutter-less cards share a
 * corner, so an interior intersection gets one mark, not two overlapping ones) and at
 * the same (offset) coordinates as the outlines, so the marks move with the nudge.
 */
const drawRegistrationMark = (page: PDFPage, x: number, y: number): void => {
  const len = mm(REG_MARK_LEN_MM)
  page.drawLine({
    start: {x: x - len, y},
    end: {x: x + len, y},
    thickness: HAIRLINE_WIDTH,
    color: GRID_COLOR,
  })
  page.drawLine({
    start: {x, y: y - len},
    end: {x, y: y + len},
    thickness: HAIRLINE_WIDTH,
    color: GRID_COLOR,
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
 * Preset id + offsets, then the "how to test print" copy, stacked top-down in the
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
 * Render the test print for already-validated `params`. Throws if the preset can't
 * resolve — callers are expected to have run `parseCalibrationParams` first, so
 * that should only happen if the two modules drift out of sync.
 */
export const renderCalibrationPdf = async (params: CalibrationPdfParams): Promise<Uint8Array> => {
  const layout = layoutFor(params.preset)
  if (!layout) throw new Error(`unknown preset: ${params.preset}`)

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const {pageSize, cardRects} = layout
  const cornerRadius = layout.layout.cornerRadius ?? 0
  const page = doc.addPage([pageSize.width, pageSize.height])

  const offsetXPt = mm(params.offsetX)
  const offsetYPt = mm(params.offsetY)
  const offsetRects = cardRects.map((rect) => ({
    ...rect,
    x: rect.x + offsetXPt,
    y: rect.y + offsetYPt,
  }))

  for (const rect of offsetRects) drawCardOutline(page, rect, pageSize.height, cornerRadius)

  // Registration marks: one crosshair per unique grid-corner point (dedup by
  // coordinate), drawn from the same offset rects as the outlines above.
  const corners = new Map<string, {x: number; y: number}>()
  for (const rect of offsetRects) {
    for (const corner of rectCorners(rect, pageSize.height)) {
      corners.set(`${corner.x.toFixed(3)}:${corner.y.toFixed(3)}`, corner)
    }
  }
  for (const corner of corners.values()) drawRegistrationMark(page, corner.x, corner.y)

  drawTopRuler(page, pageSize, font)
  drawLeftRuler(page, pageSize, font)
  drawFooterText(page, pageSize, font, params)

  return doc.save()
}
