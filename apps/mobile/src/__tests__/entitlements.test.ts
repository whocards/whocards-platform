/**
 * Tests for src/lib/entitlements.ts — the ADR-0006 seam. In the early-access
 * phase every tier must resolve granted, with paid tiers labelled
 * 'early_access' so the UI can badge them.
 */

import {getEntitlement} from '../lib/entitlements'
import {GAME_CATALOG} from '../lib/games'

describe('entitlements (early-access stub)', () => {
  it('grants free as free', async () => {
    expect(await getEntitlement('free')).toEqual({granted: true, reason: 'free'})
  })

  it('grants paid tiers as early_access', async () => {
    expect(await getEntitlement('unlock')).toEqual({granted: true, reason: 'early_access'})
    expect(await getEntitlement('subscription')).toEqual({granted: true, reason: 'early_access'})
  })

  it('grants every game in the catalog', async () => {
    for (const game of GAME_CATALOG) {
      const entitlement = await getEntitlement(game.tier)
      expect(entitlement.granted).toBe(true)
    }
  })
})
