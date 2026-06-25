import {describe, expect, it} from 'vitest'

import {computeAppVisible} from './app-visibility'

// The public /app funnel (route, nav entry, homepage CTA) is gated entirely by
// computeAppVisible. These cases lock in the safe-by-default behaviour that lets
// the email/consent backend ship while the waitlist UI stays hidden.
describe('computeAppVisible — /app funnel gating', () => {
  it('is hidden by default — both flags off keeps /app off (redirects home)', () => {
    expect(computeAppVisible(false, false)).toBe(false)
  })

  it('is visible in waitlist mode — PUBLIC_APP_WAITLIST_ENABLED opens the funnel pre-launch', () => {
    expect(computeAppVisible(false, true)).toBe(true)
  })

  it('is visible once launched, even when the waitlist flag is off', () => {
    expect(computeAppVisible(true, false)).toBe(true)
  })

  it('is visible when launched with the waitlist flag also on', () => {
    expect(computeAppVisible(true, true)).toBe(true)
  })
})
