import {decksRouter} from './routers/decks'
import {poolRouter} from './routers/pool'
import {createTRPCRouter} from './trpc'

/**
 * The WhoCards API — a host-agnostic tRPC router. Mounted by apps/website today
 * (served from an Astro endpoint) and re-mountable by a future TanStack Start
 * host; consumed by mobile via @trpc/client for end-to-end types (ADR-0002).
 */
export const appRouter = createTRPCRouter({
  decks: decksRouter,
  pool: poolRouter,
})

export type AppRouter = typeof appRouter
