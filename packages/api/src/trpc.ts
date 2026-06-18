import {initTRPC} from '@trpc/server'

/**
 * The API context. The content router is public and stateless, but the host
 * supplies a `recordAnswer` port so `answers.record` can persist to the Answer
 * record without `@whocards/api` importing a host (port/adapter — ADR-0002).
 * The Drizzle-backed adapter lives in apps/website's `createContext`; HTTP
 * clients (mobile/web) never build a context.
 */
export type Context = {
  recordAnswer: (input: {
    deviceId: string
    deckSlug: string
    questionId: string
    language: string
    type: string
  }) => Promise<void>
}

const t = initTRPC.context<Context>().create()

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure
