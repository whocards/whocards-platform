import {initTRPC} from '@trpc/server'

/**
 * The API context. The content router is public and stateless today; auth /
 * purchases / custom-deck mutations will widen this later (ADR-0002).
 */
export type Context = Record<string, never>

const t = initTRPC.context<Context>().create()

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure
