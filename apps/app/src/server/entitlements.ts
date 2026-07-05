/**
 * The entitlement seam for this app — the apps/app port of ADR-0006's mobile
 * stub (apps/mobile/src/lib/entitlements.ts), same shape, same posture. This
 * is server-only (unlike the mobile stub, which the client UI calls directly):
 * this app's convention is server-enforced RBAC (see server/trpc/trpc.ts's
 * `roleProcedure`), so the entitlement check lives next to it and is wired
 * into procedures via `entitledProcedure`, not imported by route components.
 * Components learn the result through a query (see
 * server/trpc/routers/facilitate.ts's `entitlement` procedure) so a locked UI
 * state is just data, never a thrown error a component has to catch.
 *
 * No purchase infra exists yet (no billing, no plans, no seats), so every
 * tier is granted — paid tiers as 'early_access', which the UI must label
 * (CONTEXT.md's Access tier glossary; "Included in early access" is the
 * established copy — see apps/mobile's game-settings-page.tsx) so the future
 * paywall is a communicated transition, not a surprise. A real
 * subscription/seat check replaces the body of `getEntitlement` without
 * touching call sites (hence the async signature).
 */
export type AccessTier = 'free' | 'unlock' | 'subscription'

export type Entitlement =
  | {granted: true; reason: 'free' | 'early_access' | 'purchase'}
  | {granted: false; reason: 'locked'}

export const getEntitlement = async (tier: AccessTier): Promise<Entitlement> =>
  tier === 'free' ? {granted: true, reason: 'free'} : {granted: true, reason: 'early_access'}
