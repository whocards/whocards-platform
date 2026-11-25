import {describe, expect, it} from 'vitest'

import {isIos} from './store-links'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124 Mobile'

describe('isIos', () => {
  it('matches iPhone', () => {
    expect(isIos({userAgent: iphone, maxTouchPoints: 5})).toBe(true)
  })

  it('matches an iPad sending the desktop Mac user agent', () => {
    expect(isIos({userAgent: mac, maxTouchPoints: 5})).toBe(true)
  })

  it('leaves a real Mac and Android alone', () => {
    expect(isIos({userAgent: mac, maxTouchPoints: 0})).toBe(false)
    expect(isIos({userAgent: android, maxTouchPoints: 5})).toBe(false)
  })
})
