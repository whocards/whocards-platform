import {describe, expect, it} from 'vitest'

import {computeAppVisible} from './app-visibility'

// The public /app funnel (route, nav entry, homepage CTA) is gated by
// computeAppVisible. iOS and Android launch on separate timelines, so it takes a
// per-store flag for each. These cases lock in the safe-by-default behaviour and
// the split-launch state we ship today (iOS live, Android still in Closed Testing).
describe('computeAppVisible — /app funnel gating', () => {
  it('is hidden when neither store is live (/app redirects home)', () => {
    expect(computeAppVisible(false, false)).toBe(false)
  })

  it('is visible once iOS is live (the split-launch state today)', () => {
    expect(computeAppVisible(true, false)).toBe(true)
  })

  it('is visible once Android is live', () => {
    expect(computeAppVisible(false, true)).toBe(true)
  })

  it('is visible when both stores are live', () => {
    expect(computeAppVisible(true, true)).toBe(true)
  })
})
