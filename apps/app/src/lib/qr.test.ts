import {describe, expect, it} from 'vitest'

import {qrMatrix, qrSvg} from './qr'

const finderAt = (m: boolean[][], x0: number, y0: number) =>
  Array.from({length: 7}, (_row, y) =>
    Array.from({length: 7}, (_col, x) => (m[y0 + y]?.[x0 + x] ? '#' : '.')).join('')
  )

const FINDER = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######']

// Decoding was checked against zxing-wasm for versions 1-9 when this encoder was written.
describe('qrMatrix', () => {
  it('fits a join link in version 4 with three finder patterns', () => {
    const m = qrMatrix('https://whocards.cc/events/sdd-2026?code=K7QM2')
    expect(m).toHaveLength(33)
    expect(finderAt(m, 0, 0)).toEqual(FINDER)
    expect(finderAt(m, 26, 0)).toEqual(FINDER)
    expect(finderAt(m, 0, 26)).toEqual(FINDER)
    expect(m[25]?.[8]).toBe(true)
  })

  it('grows with the text and refuses past version 9', () => {
    expect(qrMatrix('hi')).toHaveLength(21)
    expect(qrMatrix('x'.repeat(180))).toHaveLength(53)
    expect(() => qrMatrix('x'.repeat(181))).toThrow('Text too long')
  })

  it('draws one unit square per dark module inside a quiet zone', () => {
    const dark = qrMatrix('hi').flat().filter(Boolean).length
    const svg = qrSvg('hi')
    expect(svg.match(/h1v1h-1z/g)).toHaveLength(dark)
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg).toContain('d="M4 4')
  })
})
