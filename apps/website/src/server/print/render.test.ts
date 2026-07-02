import {inflateSync} from 'node:zlib'

import {PDFArray, PDFDocument, PDFRawStream} from 'pdf-lib'
import {describe, expect, it, vi} from 'vitest'

import {layoutFor, PHYSICAL_LAYOUTS} from './presets'
import {cornerInset, libraryCardsFor, renderPrintPdf} from './render'

/**
 * Re-parses a rendered PDF's page and inflates its content stream back to raw
 * operator text — same approach as ./calibration.test.ts — so a test can assert on
 * *where* something was drawn (via the `Tm` text-positioning operator) without a
 * pixel-level rendering diff.
 */
const decodedPageContent = async (bytes: Uint8Array, pageIndex = 0): Promise<string> => {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPage(pageIndex).node.Contents()
  if (contents instanceof PDFArray) {
    const stream = contents.lookup(0, PDFRawStream)
    return inflateSync(Buffer.from(stream.getContents())).toString('latin1')
  }
  if (!(contents instanceof PDFRawStream)) throw new Error('expected a raw content stream')
  return inflateSync(Buffer.from(contents.getContents())).toString('latin1')
}

describe('cornerInset (#138)', () => {
  it('is 0 for square-corner layouts (no cornerRadius)', () => {
    expect(cornerInset(0)).toBe(0)
  })

  it('is positive and less than the radius itself for a rounded corner', () => {
    const r = PHYSICAL_LAYOUTS['a4-99x67-8up'].cornerRadius!
    const inset = cornerInset(r)
    expect(inset).toBeGreaterThan(0)
    // The geometric setback (r * (1 - 1/√2)) is strictly less than r; the fixed pad on
    // top is small (1pt), so the whole inset should still land comfortably under 2*r
    // for a corner radius this size.
    expect(inset).toBeLessThan(r * 2)
  })

  it('grows with the radius', () => {
    expect(cornerInset(10)).toBeGreaterThan(cornerInset(4))
  })
})

// These tests intentionally don't snapshot pixels — they check what's cheaply
// verifiable without a rendering diff: page geometry, page count, and that a
// real, re-parseable PDF with a plausible size comes out.

describe('libraryCardsFor', () => {
  it('returns all 66 Pool questions, in pool order, for a supported language', () => {
    const cards = libraryCardsFor('en')
    expect(cards).toHaveLength(66)
    expect(cards[0]?.id).toBe('1')
    expect(cards.at(-1)?.id).toBe('66')
  })

  it('returns Cyrillic text for Serbian (no transliteration)', () => {
    const cards = libraryCardsFor('sr')
    expect(cards).toHaveLength(66)
    expect(cards[0]?.text).toMatch(/[Ѐ-ӿ]/)
  })

  it('returns Hebrew text for he (#41 RTL)', () => {
    const cards = libraryCardsFor('he')
    expect(cards).toHaveLength(66)
    expect(cards[0]?.text).toMatch(/[֐-׿]/)
  })

  it('returns CJK text for zh/jp (#41)', () => {
    expect(libraryCardsFor('zh')[0]?.text).toMatch(/[一-鿿]/)
    expect(libraryCardsFor('jp')[0]?.text).toMatch(/[぀-ヿ一-鿿]/)
  })
})

describe('renderPrintPdf', () => {
  it('produces a PDF with the preset page size, 7 pages for the full 66-card library at 10-up', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'en',
      preset: 'avery-5371',
      offsetX: 0,
      offsetY: 0,
    })

    // A plausible, non-trivial PDF (embedded font + logo + 7 pages of text).
    expect(bytes.byteLength).toBeGreaterThan(5_000)

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7) // ceil(66 / 10)

    const layout = layoutFor('avery-5371')!
    const page = doc.getPage(0)
    const {width, height} = page.getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  }, 20_000)

  it('renders a Cyrillic (Serbian) deck without throwing', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'sr',
      preset: 'avery-5371',
      offsetX: 0,
      offsetY: 0,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
  }, 20_000)

  it('produces the same page count on a different physical layout (A4 85x55, still 10-up)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'en',
      preset: 'sigel-lp798',
      offsetX: 0,
      offsetY: 0,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
    const layout = layoutFor('sigel-lp798')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  }, 20_000)

  it('renders the Avery L7165 sticker sheet at 8-up: 9 pages, last page 2 cards (#138)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'en',
      preset: 'avery-l7165',
      offsetX: 0,
      offsetY: 0,
    })
    expect(bytes.byteLength).toBeGreaterThan(5_000)

    const doc = await PDFDocument.load(bytes)
    // ceil(66 / 8) = 9 pages; the last page only has 66 - 8*8 = 2 cards, but that's a
    // rendering-loop detail (`pageCards.forEach` just runs fewer times) rather than
    // something that changes the page itself, so page count/size is what's cheaply
    // checkable here.
    expect(doc.getPageCount()).toBe(9)

    const layout = layoutFor('avery-l7165')!
    expect(layout.perPage).toBe(8)
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
    // Same A4 page on every page, including the short last page.
    const lastPage = doc.getPage(8).getSize()
    expect(lastPage.width).toBeCloseTo(layout.pageSize.width)
    expect(lastPage.height).toBeCloseTo(layout.pageSize.height)
  }, 20_000)

  it('insets the Pool ID and logo to clear the rounded corners on the L7165 sticker sheet (#138)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'en',
      preset: 'avery-l7165',
      offsetX: 0,
      offsetY: 0,
    })
    const content = await decodedPageContent(bytes, 0)

    const layout = PHYSICAL_LAYOUTS['a4-99x67-8up']
    const {card, cornerRadius} = layout
    const PADDING_RATIO = 0.07 // mirrors render.ts's own constant
    const FOOTER_RATIO = 0.22
    const LOGO_ASPECT = 324 / 61
    const padding = Math.min(card.width, card.height) * PADDING_RATIO
    const inset = cornerInset(cornerRadius!)
    const rectX = layoutFor('avery-l7165')!.cardRects[0].x

    // The Pool ID's `Tj` (show-text) draws a single short glyph run (Pool ID "1"),
    // easy to tell apart from the much longer wrapped question text — its `Tm` gives
    // the exact x pdf-lib drew it at.
    const idMatch = content.match(/1 0 0 1 ([-\d.]+) [-\d.]+ Tm\n<[0-9A-Fa-f]{1,8}> Tj/)
    expect(idMatch, 'expected to find the Pool ID text draw').toBeTruthy()
    const idX = Number(idMatch![1])
    expect(idX).toBeCloseTo(rectX + padding + inset, 5)
    // ...and strictly further right than it would sit with no corner inset at all —
    // proving the plumbing (registry -> renderPrintPdf -> drawCard) actually applies it.
    expect(idX).toBeGreaterThan(rectX + padding)

    // The logo image is placed via a `cm` (transform) operator right before its `Do`
    // (paint XObject); its translation is the logo's bottom-left x/y.
    const footerHeight = card.height * FOOTER_RATIO
    const logoWidth = footerHeight * 0.8 * LOGO_ASPECT
    const logoMatch = content.match(
      /1 0 0 1 ([-\d.]+) [-\d.]+ cm\n1 0 0 1 0 0 cm\n[-\d.]+ 0 0 [-\d.]+ 0 0 cm\n1 0 0 1 0 0 cm\n\/Image-/
    )
    expect(logoMatch, 'expected to find the logo image placement').toBeTruthy()
    const logoX = Number(logoMatch![1])
    expect(logoX).toBeCloseTo(rectX + card.width - padding - inset - logoWidth, 5)
    expect(logoX).toBeLessThan(rectX + card.width - padding - logoWidth)
  }, 20_000)

  it('applies the mm offset uniformly (page size/count unaffected)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'en',
      preset: 'avery-5371',
      offsetX: 3,
      offsetY: -2,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
  }, 20_000)

  it('renders Hebrew (RTL, bidi-reordered) without throwing, same page geometry (#41)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'he',
      preset: 'avery-5371',
      offsetX: 0,
      offsetY: 0,
    })
    expect(bytes.byteLength).toBeGreaterThan(5_000)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
    const layout = layoutFor('avery-5371')!
    const {width, height} = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(layout.pageSize.width)
    expect(height).toBeCloseTo(layout.pageSize.height)
  }, 20_000)

  it('renders Japanese (CJK per-character wrap) without throwing, same page geometry (#41)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'jp',
      preset: 'avery-5371',
      offsetX: 0,
      offsetY: 0,
    })
    expect(bytes.byteLength).toBeGreaterThan(5_000)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
  }, 20_000)

  it('renders Mandarin (CJK per-character wrap) without throwing (#41)', async () => {
    const bytes = await renderPrintPdf({
      deck: 'library',
      lang: 'zh',
      preset: 'avery-5371',
      offsetX: 0,
      offsetY: 0,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(7)
  }, 20_000)

  // Regression test for a real bug found on the Netlify deploy preview: the
  // font/logo loader used to resolve bundled assets via `process.cwd()`
  // alone, which matches the astro project root in dev/build/tests but NOT
  // at Netlify Function runtime (there, cwd is the function bundle root, one
  // level above where `includeFiles` actually land). `vi.resetModules()`
  // forces a fresh copy of ./render (so its cached resolved base dir can't
  // leak in from an earlier, correct-cwd test) before simulating a cwd that
  // doesn't match the astro project root — that forces the loader's other
  // resolution strategies (this module's own compiled location via
  // `import.meta.url`, `LAMBDA_TASK_ROOT`) to do the work instead of cwd.
  it('resolves fonts/logo even when process.cwd() is not the astro project root', async () => {
    const originalCwd = process.cwd()
    vi.resetModules()
    process.chdir('/tmp')
    try {
      const {renderPrintPdf: freshRenderPrintPdf} = await import('./render')
      const bytes = await freshRenderPrintPdf({
        deck: 'library',
        lang: 'en',
        preset: 'avery-5371',
        offsetX: 0,
        offsetY: 0,
      })
      expect(bytes.byteLength).toBeGreaterThan(5_000)
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(7)
    } finally {
      process.chdir(originalCwd)
    }
  }, 20_000)
})
