import {timingSafeEqual} from 'node:crypto'
import {logError} from '@whocards/observability'
import type {APIRoute} from 'astro'
import {env} from '~env'
import {refreshStatsSnapshot} from '~server/stats'

export const prerender = false

// Enforced here, not in the env schema, so a short secret disables refresh instead of the whole site.
const MIN_SECRET_LENGTH = 16

const isAuthorized = (request: Request, secret: string): boolean => {
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const POST: APIRoute = async ({request}) => {
  const secret = env.STATS_REFRESH_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return new Response('STATS_REFRESH_SECRET is not set', {status: 503})
  }
  if (!isAuthorized(request, secret)) return new Response('Unauthorized', {status: 401})

  try {
    const snapshot = await refreshStatsSnapshot()
    return Response.json({generatedAt: snapshot.generatedAt})
  } catch (error) {
    logError('stats refresh failed', error, {route: '/api/stats/refresh'})
    return new Response('Refresh failed', {status: 500})
  }
}
