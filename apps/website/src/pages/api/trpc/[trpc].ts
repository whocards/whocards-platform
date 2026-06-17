import type {APIRoute} from 'astro'
import {fetchRequestHandler} from '@trpc/server/adapters/fetch'
import {appRouter} from '@whocards/api'

// SSR (part of the Netlify function) — not prerendered.
export const prerender = false

const handler: APIRoute = ({request}) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => ({}),
    responseMeta: ({errors, type}) => {
      // Read-only content queries are edge-cacheable (ADR-0002). Only cache
      // successful queries; never cache errors or mutations.
      const cacheable = errors.length === 0 && type === 'query'
      return cacheable
        ? {
            headers: {
              'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
            },
          }
        : {}
    },
  })

export const GET = handler
export const POST = handler
