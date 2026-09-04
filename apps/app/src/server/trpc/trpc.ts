import {initTRPC, TRPCError} from '@trpc/server'

import {roleAtLeast} from '../auth/permissions'
import type {AppRole} from '../auth/permissions'
import {getEntitlement} from '../entitlements'
import type {AccessTier, Entitlement} from '../entitlements'
import type {TRPCContext} from './context'

const t = initTRPC.context<TRPCContext>().create()

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

/** Requires a signed-in, provisioned (has an org membership) caller. */
export const protectedProcedure = t.procedure.use(({ctx, next}) => {
  if (!ctx.user || !ctx.membership) {
    throw new TRPCError({code: 'UNAUTHORIZED', message: 'Sign in and ask an admin to invite you.'})
  }
  return next({ctx: {...ctx, user: ctx.user, membership: ctx.membership}})
})

/** `roleProcedure('facilitator')` etc — protectedProcedure plus a minimum role
 *  in the ROLE_RANK hierarchy (see server/auth/permissions.ts). */
export const roleProcedure = (min: AppRole) =>
  protectedProcedure.use(({ctx, next}) => {
    if (!roleAtLeast(ctx.membership.role, min)) {
      throw new TRPCError({code: 'FORBIDDEN', message: `Requires ${min} or above.`})
    }
    return next({ctx})
  })

/**
 * `entitledProcedure('subscription')` — protectedProcedure plus the
 * server/entitlements.ts seam (ADR-0006's pattern). Unlike `roleProcedure`,
 * this isn't an org-role check: it's "does this caller's plan include this
 * feature," independent of what they're allowed to *do* within the app. A
 * denied entitlement throws FORBIDDEN, same as a failed role check, so a
 * direct API call can't route around the client's locked/upsell state (see
 * routers/facilitate.ts's `entitlement` query, which the UI checks first so
 * it never has to catch this).
 *
 * `resolve` defaults to the real `getEntitlement` stub, but is injectable so
 * tests can exercise the deny branch without waiting on real purchase infra
 * to exist — today's stub always grants (see entitlements.test.ts), so this
 * is the only way to prove the gate itself actually blocks when it should
 * (see trpc.test.ts's `entitledProcedure` suite).
 */
export const entitledProcedure = (
  tier: AccessTier,
  resolve: (tier: AccessTier) => Promise<Entitlement> = getEntitlement
) =>
  protectedProcedure.use(async ({ctx, next}) => {
    const entitlement = await resolve(tier)
    if (!entitlement.granted) {
      throw new TRPCError({code: 'FORBIDDEN', message: 'This feature requires an active plan.'})
    }
    return next({ctx: {...ctx, entitlement}})
  })
