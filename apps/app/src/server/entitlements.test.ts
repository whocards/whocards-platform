/**
 * Tests for entitlements.ts — the apps/app port of the ADR-0006 seam. In the
 * early-access phase every tier must resolve granted, with paid tiers
 * labelled 'early_access' so the UI can badge them. Mirrors apps/mobile's
 * entitlements.test.ts.
 */

import {describe, expect, it} from 'vitest'

import {getEntitlement} from './entitlements'

describe('getEntitlement (early-access stub)', () => {
  it('grants free as free', async () => {
    expect(await getEntitlement('free')).toEqual({granted: true, reason: 'free'})
  })

  it('grants paid tiers as early_access', async () => {
    expect(await getEntitlement('unlock')).toEqual({granted: true, reason: 'early_access'})
    expect(await getEntitlement('subscription')).toEqual({granted: true, reason: 'early_access'})
  })
})
