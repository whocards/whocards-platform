import {initTRPC, TRPCError} from '@trpc/server'

import type {GamePort} from './game/port'
import {GameRefusalError} from './game/refusal'

/**
 * The API context. The content router is public and stateless, but the host
 * supplies ports (`recordAnswer`, `game`) so routers can persist without
 * `@whocards/api` importing a host (port/adapter — ADR-0002). The Drizzle-backed
 * adapters live in apps/website's `createContext`; HTTP clients (mobile/web)
 * never build a context.
 */
export type Context = {
  recordAnswer: (input: {
    deviceId: string
    deckSlug: string
    questionId: string
    language: string
    type: string
  }) => Promise<void>
  game: GamePort
  /** From the PLAYER_TOKEN_HEADER request header; null when absent. */
  playerToken: string | null
}

const t = initTRPC.context<Context>().create({
  errorFormatter: ({shape, error}) => ({
    ...shape,
    data: {
      ...shape.data,
      refusal: error.cause instanceof GameRefusalError ? error.cause.reason : null,
    },
  }),
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

/** A procedure for a joined player: resolves `ctx.player` from the bearer token. */
export const playerProcedure = t.procedure.use(async ({ctx, next}) => {
  const player = ctx.playerToken ? await ctx.game.findPlayerByToken(ctx.playerToken) : null
  if (!player) throw new TRPCError({code: 'UNAUTHORIZED', message: 'Join the game first'})
  return next({ctx: {player}})
})
