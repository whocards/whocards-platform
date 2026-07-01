// On-demand print PDF renderer (epic #19, ticket #38). Takes already-validated
// params (see ./params) and produces PDF bytes for the `library` deck's full
// Pool (66 questions, IDs 1-66, pool order) laid out on the requested preset's
// grid. `./presets` (ticket #37) is the single source of geometry truth — this
// module only consumes `layoutFor()`'s rects, it never computes its own.
//
// Card face (1-sided): centered question text, Pool ID bottom-left, the
// WhoCards wordmark bottom-right. `CardContent.imageUrl` is a reserved slot
// for a future per-question image (not rendered yet — see epic "Later").

import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import process from 'node:process'

import fontkit from '@pdf-lib/fontkit'
import {Resvg} from '@resvg/resvg-js'
import {getDeck} from '@whocards/decks'
import bidiFactory from 'bidi-js'
import {PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage} from 'pdf-lib'
import {decompress} from 'wawoff2'

import type {PrintPdfParams} from './params'
import {layoutFor, mm, type Rect} from './presets'
import {fitText, type WrapMode} from './text-fit'

const TEXT_COLOR = rgb(0.06, 0.06, 0.09) // near-black; renders on white print stock
const ID_COLOR = rgb(0.45, 0.45, 0.5)

// Aptly is the WhoCards brand display face and is used for the question text
// on Latin-script cards. It has no Cyrillic glyphs (verified against
// public/fonts/aptly_regular.woff2 with @pdf-lib/fontkit — missing glyphs
// don't throw, they silently render as blank), so Serbian falls back to Golos
// Text, the same body font src/server/card-image.ts uses for non-Latin
// scripts. Hebrew/Mandarin/Japanese (#41) need their own Noto Sans subsets —
// same regular-weight files src/server/card-image.ts already embeds for the
// OG social cards, so no new font assets, just reuse for the print PDF.
type FontKey = 'aptly' | 'golos' | 'hebrew' | 'chinese' | 'japanese'
const FONT_FILES: Record<FontKey, string> = {
  aptly: 'aptly_regular.woff2',
  golos: 'golos_text.woff2',
  hebrew: 'noto-sans-hebrew_regular.woff2',
  chinese: 'noto-sans-chinese_regular.woff2',
  japanese: 'noto-sans-japanese_regular.woff2',
}
const CYRILLIC_LANGUAGES = new Set(['sr'])
const SCRIPT_FONT: Partial<Record<string, FontKey>> = {he: 'hebrew', zh: 'chinese', jp: 'japanese'}
const fontKeyFor = (lang: string): FontKey =>
  SCRIPT_FONT[lang] ?? (CYRILLIC_LANGUAGES.has(lang) ? 'golos' : 'aptly')

// Hebrew is the only RTL Pool language; Mandarin/Japanese are CJK (no spaces,
// so word-wrap never breaks a line — see ./text-fit's 'cjk' mode).
const RTL_LANGUAGES = new Set(['he'])
const CJK_LANGUAGES = new Set(['zh', 'jp'])
const isRtl = (lang: string): boolean => RTL_LANGUAGES.has(lang)
const wrapModeFor = (lang: string): WrapMode => (CJK_LANGUAGES.has(lang) ? 'cjk' : 'word')

// pdf-lib/fontkit lay out glyphs strictly in logical string order — no bidi
// reordering, unlike a browser or a shaping-aware layout engine. Hebrew text
// must therefore be reordered into visual order before `drawText`, the same
// approach src/server/card-image.ts already uses (via bidi-js) for the OG
// social cards' Satori/SVG pipeline, which has the identical problem.
const bidi = bidiFactory()
const toVisualOrder = (line: string): string => {
  if (!line) return line
  const levels = bidi.getEmbeddingLevels(line, 'rtl')
  return bidi.getReorderedString(line, levels)
}

// Fonts live in /public, the logo in /src/icons. This endpoint runs on-demand
// (`prerender = false`, a Netlify function), so both are declared in
// astro.config.ts's `netlify({includeFiles: [...]})` to be bundled with the
// function — resolving them from `process.cwd()` mirrors card-image.ts.
const fontDir = join(process.cwd(), 'public', 'fonts')
const iconsDir = join(process.cwd(), 'src', 'icons')

const ttfCache = new Map<FontKey, Promise<Buffer>>()
const loadTtf = (key: FontKey): Promise<Buffer> => {
  let cached = ttfCache.get(key)
  if (!cached) {
    cached = (async () => {
      const woff2 = await readFile(join(fontDir, FONT_FILES[key]))
      return Buffer.from(await decompress(woff2))
    })()
    ttfCache.set(key, cached)
  }
  return cached
}

// logo-plain.svg's own viewBox aspect ratio (0 0 324 61), used to size the
// rasterised logo without distortion.
const LOGO_ASPECT = 324 / 61

let logoPngPromise: Promise<Buffer> | undefined
const loadLogoPng = (): Promise<Buffer> => {
  if (!logoPngPromise) {
    logoPngPromise = (async () => {
      const svg = await readFile(join(iconsDir, 'logo-plain.svg'), 'utf8')
      const resvg = new Resvg(svg, {fitTo: {mode: 'width', value: 900}})
      return Buffer.from(resvg.render().asPng())
    })()
  }
  return logoPngPromise
}

/** One card's renderable content. `imageUrl` is reserved for a future per-question image. */
export type CardContent = {
  id: string
  text: string
  imageUrl?: string
}

/** Ordered card content for the `library` deck in `lang`, pool order, IDs 1-66. */
export const libraryCardsFor = (lang: string): CardContent[] => {
  const deck = getDeck('library')
  if (!deck) throw new Error('library deck is not registered in @whocards/decks')
  const cards: CardContent[] = []
  for (const id of deck.questionIds) {
    const text = deck.questions[id]?.[lang]
    if (typeof text === 'string') cards.push({id, text})
  }
  return cards
}

// Card-interior layout, expressed as fractions of the card's own size so every
// preset (US Letter, the A4 variants) gets a proportionally identical face.
const PADDING_RATIO = 0.07
const FOOTER_RATIO = 0.22
const MIN_FONT_PT = 7
const MAX_FONT_PT = 20
const LINE_HEIGHT_MULTIPLIER = 1.25

const drawCard = (
  page: PDFPage,
  rect: Rect,
  pageHeight: number,
  content: CardContent,
  lang: string,
  font: PDFFont,
  logo: PDFImage
): void => {
  // `rect` is in the same top-down coordinate space as presets.ts's
  // `cardRects`; pdf-lib pages are bottom-origin, so flip once here.
  const pdfX = rect.x
  const pdfY = pageHeight - rect.y - rect.height

  const padding = Math.min(rect.width, rect.height) * PADDING_RATIO
  const footerHeight = rect.height * FOOTER_RATIO

  const textBox = {
    x: pdfX + padding,
    y: pdfY + footerHeight,
    width: rect.width - padding * 2,
    height: rect.height - footerHeight - padding,
  }

  const {
    lines: logicalLines,
    size,
    lineHeight,
  } = fitText(content.text, font, {
    maxWidth: textBox.width,
    maxHeight: textBox.height,
    minSize: MIN_FONT_PT,
    maxSize: MAX_FONT_PT,
    lineHeightMultiplier: LINE_HEIGHT_MULTIPLIER,
    mode: wrapModeFor(lang),
  })
  // Wrapping/measurement happens in logical (reading) order — reordering a
  // line doesn't change its glyphs or width, only their draw order — so only
  // the final lines need flipping to visual order for RTL before drawing.
  // The block stays centred either way: centring doesn't care about direction.
  const lines = isRtl(lang) ? logicalLines.map(toVisualOrder) : logicalLines

  const blockHeight = lines.length * lineHeight
  // Baseline of the first line, with the whole block vertically centred in textBox.
  let cursorY = textBox.y + (textBox.height - blockHeight) / 2 + blockHeight - size
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size)
    page.drawText(line, {
      x: textBox.x + (textBox.width - lineWidth) / 2,
      y: cursorY,
      size,
      font,
      color: TEXT_COLOR,
      lineHeight,
    })
    cursorY -= lineHeight
  }

  // Pool ID, bottom-left.
  const idSize = Math.max(MIN_FONT_PT, footerHeight * 0.4)
  page.drawText(content.id, {
    x: pdfX + padding,
    y: pdfY + (footerHeight - idSize) / 2,
    size: idSize,
    font,
    color: ID_COLOR,
  })

  // WhoCards wordmark, bottom-right.
  const logoHeight = footerHeight * 0.8
  const logoWidth = logoHeight * LOGO_ASPECT
  page.drawImage(logo, {
    x: pdfX + rect.width - padding - logoWidth,
    y: pdfY + (footerHeight - logoHeight) / 2,
    width: logoWidth,
    height: logoHeight,
  })
}

/**
 * Render a full print PDF for already-validated `params`. Throws if the
 * preset/deck/lang can't resolve — callers are expected to have run
 * `parsePrintParams` first, so that should only happen if the two modules
 * drift out of sync.
 */
export const renderPrintPdf = async (params: PrintPdfParams): Promise<Uint8Array> => {
  const layout = layoutFor(params.preset)
  if (!layout) throw new Error(`unknown preset: ${params.preset}`)

  const cards = libraryCardsFor(params.lang)
  if (cards.length === 0) throw new Error(`no questions available for language: ${params.lang}`)

  const [ttf, logoPng] = await Promise.all([loadTtf(fontKeyFor(params.lang)), loadLogoPng()])

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(ttf, {subset: true})
  const logo = await doc.embedPng(logoPng)

  const offsetXPt = mm(params.offsetX)
  const offsetYPt = mm(params.offsetY)

  const {pageSize, perPage, cardRects} = layout
  const pageCount = Math.ceil(cards.length / perPage)

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = doc.addPage([pageSize.width, pageSize.height])
    const pageCards = cards.slice(pageIndex * perPage, pageIndex * perPage + perPage)
    pageCards.forEach((content, slot) => {
      const rect = cardRects[slot]
      if (!rect) return
      // offsetX positive = right, offsetY positive = down (top-down mm nudge,
      // matching the calibration UI in #40).
      const shifted: Rect = {
        x: rect.x + offsetXPt,
        y: rect.y + offsetYPt,
        width: rect.width,
        height: rect.height,
      }
      drawCard(page, shifted, pageSize.height, content, params.lang, font, logo)
    })
  }

  return doc.save()
}
