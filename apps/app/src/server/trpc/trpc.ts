import {initTRPC, TRPCError} from '@trpc/server'

import {roleAtLeast} from '../auth/permissions'
import type {AppRole} from '../auth/permissions'
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
