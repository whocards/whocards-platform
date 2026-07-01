import {PDFDocument} from 'pdf-lib'
import {describe, expect, it, vi} from 'vitest'

import {layoutFor} from './presets'
import {libraryCardsFor, renderPrintPdf} from './render'

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
