import {describe, expect, it} from 'vitest'

import {qrPath} from './qr'

describe('qrPath', () => {
  it('draws a square code with a quiet border', () => {
    const {size, d} = qrPath('ABC234')
    expect(size).toBeGreaterThanOrEqual(25)
    expect(d).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(d).not.toContain('M0 0')
  })
})
