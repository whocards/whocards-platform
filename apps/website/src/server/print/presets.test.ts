import {describe, expect, it} from 'vitest'

import {inch, layoutFor, mm, PHYSICAL_LAYOUTS, resolveLayout, SKU_ALIASES} from './presets'
import type {LayoutId} from './presets'

describe('resolveLayout', () => {
  it('resolves a physical layout id', () => {
    expect(resolveLayout('us-letter-10up')?.id).toBe('us-letter-10up')
  })

  it('resolves a SKU alias to its layout', () => {
    expect(resolveLayout('avery-5371')?.id).toBe('us-letter-10up')
    expect(resolveLayout('sigel-lp798')?.id).toBe('a4-85x55-10up')
  })

  it('resolves the L7165/J8165 sticker sheet aliases to the same layout (#138)', () => {
    expect(resolveLayout('avery-l7165')?.id).toBe('a4-99x67-8up')
    expect(resolveLayout('avery-j8165')?.id).toBe('a4-99x67-8up')
  })

  it('returns undefined for an unknown preset', () => {
    expect(resolveLayout('not-a-real-sheet')).toBeUndefined()
  })

  it('returns undefined for Object.prototype key names', () => {
    expect(resolveLayout('constructor')).toBeUndefined()
    expect(resolveLayout('hasOwnProperty')).toBeUndefined()
    expect(resolveLayout('__proto__')).toBeUndefined()
  })

  it('every seeded SKU alias points at a real layout', () => {
    for (const [sku, id] of Object.entries(SKU_ALIASES)) {
      expect(PHYSICAL_LAYOUTS[id], `alias ${sku}`).toBeDefined()
    }
  })

  it('flags the un-calibrated clean-edge layout as unsupported', () => {
    expect(PHYSICAL_LAYOUTS['us-letter-cleanedge-8up'].supported).toBe(false)
    const supported = Object.values(PHYSICAL_LAYOUTS).filter((l) => l.supported)
    expect(supported).toHaveLength(6)
  })
})

describe('a4-99x67-8up (Avery L7165 sticker sheet, #138)', () => {
  it('is flagged supported with a corner radius set', () => {
    const layout = PHYSICAL_LAYOUTS['a4-99x67-8up']
    expect(layout.supported).toBe(true)
    expect(layout.cornerRadius).toBeCloseTo(mm(1.5))
  })

  it('is an 8-up (2x4) grid on A4', () => {
    const layout = PHYSICAL_LAYOUTS['a4-99x67-8up']
    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(4)
    expect(layout.page).toEqual(PHYSICAL_LAYOUTS['a4-85x54-10up'].page) // same A4 page
  })

  it("has a non-zero horizontal gutter and zero vertical gutter, per Avery's own spec", () => {
    const layout = PHYSICAL_LAYOUTS['a4-99x67-8up']
    expect(layout.gutter.x).toBeCloseTo(mm(2.5))
    expect(layout.gutter.y).toBe(0)
  })

  it('centres to the exact margins Avery documents (4.65mm sides, 13.1mm top/bottom)', () => {
    const out = layoutFor('a4-99x67-8up')!
    const first = out.cardRects[0]
    expect(first.x).toBeCloseTo(mm(4.65))
    expect(first.y).toBeCloseTo(mm(13.1))
  })

  it('other three corner cards land at the expected mirrored margins', () => {
    const out = layoutFor('a4-99x67-8up')!
    const topRight = out.cardRects[1]
    const bottomLeft = out.cardRects.at(-2)!
    // top-right card: right edge sits `marginLeft` in from the page's right edge
    expect(out.pageSize.width - (topRight.x + topRight.width)).toBeCloseTo(mm(4.65))
    // bottom row: bottom edge sits `marginTop` up from the page's bottom edge
    expect(out.pageSize.height - (bottomLeft.y + bottomLeft.height)).toBeCloseTo(mm(13.1))
  })
})

describe('layoutFor', () => {
  it('returns one ordered, row-major rect per card slot', () => {
    const out = layoutFor('us-letter-10up')!
    expect(out.perPage).toBe(10)
    expect(out.cardRects).toHaveLength(10)
    // row-major: first two share a y (top row), differ in x
    expect(out.cardRects[0].y).toBeCloseTo(out.cardRects[1].y)
    expect(out.cardRects[1].x).toBeGreaterThan(out.cardRects[0].x)
    // next row sits below
    expect(out.cardRects[2].y).toBeGreaterThan(out.cardRects[0].y)
  })

  it("centres the grid — Avery 5371's margins are 0.75in sides, 0.5in top", () => {
    const out = layoutFor('avery-5371')!
    const first = out.cardRects[0]
    expect(first.x).toBeCloseTo(inch(0.75)) // (8.5 - 2*3.5) / 2
    expect(first.y).toBeCloseTo(inch(0.5)) // (11 - 5*2) / 2
  })

  it('keeps every card inside the page bounds', () => {
    for (const id of Object.keys(PHYSICAL_LAYOUTS) as LayoutId[]) {
      const out = layoutFor(id)!
      for (const r of out.cardRects) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(out.pageSize.width + 1e-6)
        expect(r.y + r.height).toBeLessThanOrEqual(out.pageSize.height + 1e-6)
      }
    }
  })

  it('tiles adjacent cards with no gap when gutter is 0', () => {
    const out = layoutFor('us-letter-10up')!
    const [a, b] = out.cardRects // top row, left then right
    expect(b.x).toBeCloseTo(a.x + a.width)
  })

  it('returns undefined for an unknown preset', () => {
    expect(layoutFor('nope')).toBeUndefined()
  })
})
