import type {APIRoute} from 'astro'
import {fetchRequestHandler} from '@trpc/server/adapters/fetch'
import {appRouter, cacheControlFor} from '@whocards/api'
import {PLAYER_TOKEN_HEADER} from '@whocards/game'
import {env} from '~env'
import {db} from '~server/db'
import {answer} from '~server/db/schema'
import {createDrizzleGamePort} from '~server/game/drizzle-port'

// SSR (part of the Netlify function) — not prerendered.
export const prerender = false

const game = createDrizzleGamePort(db)

// Netlify geo, not a request header, so clients cannot pick their country. Absent in local dev.
const countryFrom = (locals: App.Locals): string | null => {
  const code = locals.netlify?.context.geo.country?.code?.toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(code) ? code : null
}

const handler: APIRoute = ({request, locals}) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    // The Drizzle-backed adapters for the router's ports (ADR-0002): the
    // router stays host-agnostic, persistence lives here.
    createContext: () => ({
      recordAnswer: async (input) => {
        await db.insert(answer).values({
          deviceId: input.deviceId,
          deckSlug: input.deckSlug,
          questionId: input.questionId,
          language: input.language,
          type: input.type,
          platform: input.platform ?? null,
          country: countryFrom(locals),
        })
      },
      game,
      playerToken: request.headers.get(PLAYER_TOKEN_HEADER),
      mobileMinVersion: env.MOBILE_MIN_VERSION ?? null,
    }),
    responseMeta: ({info, type, errors}) => {
      const paths = info?.calls.map((call) => call.path)
      const cacheControl = cacheControlFor({paths, type, errorCount: errors.length})
      return cacheControl ? {headers: {'cache-control': cacheControl}} : {}
    },
  })

export const GET = handler
export const POST = handler
