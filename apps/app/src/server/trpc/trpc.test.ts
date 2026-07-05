import {describe, expect, it} from 'vitest'

import {
  createCallerFactory,
  createTRPCRouter,
  entitledProcedure,
  protectedProcedure,
  publicProcedure,
  roleProcedure,
} from './trpc'
import type {TRPCContext} from './context'

const alwaysGrant = async () => ({granted: true, reason: 'early_access'}) as const
const alwaysDeny = async () => ({granted: false, reason: 'locked'}) as const

// A tiny router exercising the middleware chain in isolation, without touching
// the database — the real routers (people, questionReview) build on the exact
// same protectedProcedure/roleProcedure, so this covers the role-guard branches
// the plan calls out ("route+action guards") independent of DB state.
const testRouter = createTRPCRouter({
  open: publicProcedure.query(() => 'anyone'),
  membersOnly: protectedProcedure.query(() => 'members-only'),
  facilitatorsOnly: roleProcedure('facilitator').query(() => 'facilitators-only'),
  adminsOnly: roleProcedure('admin').query(() => 'admins-only'),
  // Default resolver — proves entitledProcedure actually wires up to the real
  // getEntitlement stub (which currently grants everything).
  paidFeatureDefault: entitledProcedure('subscription').query(() => 'paid-feature'),
  paidFeatureGranted: entitledProcedure('subscription', alwaysGrant).query(() => 'paid-feature'),
  paidFeatureDenied: entitledProcedure('subscription', alwaysDeny).query(() => 'paid-feature'),
})

const createCaller = createCallerFactory(testRouter)

const contextFor = (membership: TRPCContext['membership']): TRPCContext => ({
  user: membership ? {id: 'u1', email: 'someone@example.com', name: 'Someone'} : null,
  membership,
})

describe('publicProcedure', () => {
  it('is callable with no session at all', async () => {
    const caller = createCaller(contextFor(null))
    await expect(caller.open()).resolves.toBe('anyone')
  })
})

describe('protectedProcedure', () => {
  it('rejects a request with no session', async () => {
    const caller = createCaller({user: null, membership: null})
    await expect(caller.membersOnly()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })

  it('rejects a signed-in-but-unprovisioned caller (no membership)', async () => {
    const caller = createCaller({
      user: {id: 'u1', email: 'someone@example.com', name: 'Someone'},
      membership: null,
    })
    await expect(caller.membersOnly()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })

  it('allows any provisioned member, regardless of role', async () => {
    const caller = createCaller(contextFor({organizationId: 'org1', role: 'member'}))
    await expect(caller.membersOnly()).resolves.toBe('members-only')
  })
})

describe('roleProcedure', () => {
  it.each(['member', 'reviewer'] as const)('blocks %s from a facilitator+ action', async (role) => {
    const caller = createCaller(contextFor({organizationId: 'org1', role}))
    await expect(caller.facilitatorsOnly()).rejects.toMatchObject({code: 'FORBIDDEN'})
  })

  it.each(['facilitator', 'admin', 'owner'] as const)(
    'allows %s to call a facilitator+ action',
    async (role) => {
      const caller = createCaller(contextFor({organizationId: 'org1', role}))
      await expect(caller.facilitatorsOnly()).resolves.toBe('facilitators-only')
    }
  )

  it.each(['member', 'reviewer', 'facilitator'] as const)(
    'blocks %s from an admin+ action',
    async (role) => {
      const caller = createCaller(contextFor({organizationId: 'org1', role}))
      await expect(caller.adminsOnly()).rejects.toMatchObject({code: 'FORBIDDEN'})
    }
  )

  it.each(['admin', 'owner'] as const)('allows %s to call an admin+ action', async (role) => {
    const caller = createCaller(contextFor({organizationId: 'org1', role}))
    await expect(caller.adminsOnly()).resolves.toBe('admins-only')
  })

  it('rejects an unauthenticated caller before the role check', async () => {
    const caller = createCaller({user: null, membership: null})
    await expect(caller.facilitatorsOnly()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })
})

describe('entitledProcedure', () => {
  it('allows any provisioned member when the entitlement resolves granted', async () => {
    const caller = createCaller(contextFor({organizationId: 'org1', role: 'member'}))
    await expect(caller.paidFeatureGranted()).resolves.toBe('paid-feature')
  })

  it('blocks a provisioned member when the entitlement resolves denied — the gate itself', async () => {
    const caller = createCaller(contextFor({organizationId: 'org1', role: 'member'}))
    await expect(caller.paidFeatureDenied()).rejects.toMatchObject({code: 'FORBIDDEN'})
  })

  it('rejects an unauthenticated caller before the entitlement check', async () => {
    const caller = createCaller({user: null, membership: null})
    await expect(caller.paidFeatureDenied()).rejects.toMatchObject({code: 'UNAUTHORIZED'})
  })

  it('is not gated by role — even the lowest role passes once entitled', async () => {
    const caller = createCaller(contextFor({organizationId: 'org1', role: 'member'}))
    await expect(caller.paidFeatureGranted()).resolves.toBe('paid-feature')
  })

  it('defaults to the real getEntitlement stub, which currently grants every tier', async () => {
    const caller = createCaller(contextFor({organizationId: 'org1', role: 'member'}))
    await expect(caller.paidFeatureDefault()).resolves.toBe('paid-feature')
  })
})
