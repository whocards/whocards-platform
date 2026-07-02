/**
 * The entitlement seam (ADR-0006). The play engine is access-blind; this is
 * the only place UI may ask "may this player use this?". Purchases don't exist
 * yet, so every tier is granted — paid tiers as 'early_access', which the UI
 * must label so the future paywall is a communicated transition, not a
 * surprise. A real IAP/receipt/account check replaces the body of
 * `getEntitlement` without touching call sites (hence the async signature).
 */
export type AccessTier = 'free' | 'unlock' | 'subscription'

export type Entitlement =
  | {granted: true; reason: 'free' | 'early_access' | 'purchase'}
  | {granted: false; reason: 'locked'}

export const getEntitlement = async (tier: AccessTier): Promise<Entitlement> =>
  tier === 'free' ? {granted: true, reason: 'free'} : {granted: true, reason: 'early_access'}
