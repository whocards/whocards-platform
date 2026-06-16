import type {APIRoute} from 'astro'

export const prerender = false

export const GET: APIRoute = async ({request}) => {
  return new Response('ok')
}

export const POST: APIRoute = async ({request}) => {
  return new Response('ok')
}
