import type {APIContext} from 'astro'
import {describe, expect, it} from 'vitest'

// This test lives outside src/pages on purpose, same reasoning as
// ../print/endpoint.test.ts: Astro's file-based router treats every file
// under src/pages/** as a route, so a colocated test file would become a
// real (broken) route and break `astro build`'s prerender step.
import {GET} from '../../pages/api/dev/image-playground/card.png'

// `GET` only reads `url.searchParams`, so a minimal fake context is enough —
// no need to spin up a full Astro request pipeline. Vitest's default mode is
// "test" (not "production"), so `import.meta.env.DEV` is true here — the
// same as `astro dev` — exercising the endpoint's real behaviour rather than
// its 404 gate. The gate itself (import.meta.env.DEV === false -> 404) is
// verified by the build check instead (see the PR description / #144's
// precedent): `pnpm --filter website build` must produce no
// /dev/image-playground routes.
const context = (query: string): APIContext =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GET only reads `url.searchParams`; a full APIContext mock isn't worth building for these assertions.
  ({url: new URL(`https://whocards.cc/api/dev/image-playground/card.png${query}`)}) as APIContext

describe('GET /api/dev/image-playground/card.png', () => {
  it('returns a PNG for a valid og request', async () => {
    const res = await GET(context('?language=en&id=1&size=og'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('no-store')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Buffer.from(bytes.slice(0, 8)).toString('hex')).toBe('89504e470d0a1a0a')
  })

  it('applies cardOutline and theme overrides without error', async () => {
    const res = await GET(
      context('?language=en&id=1&size=story&cardOutline=true&theme=light&padding=40')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('returns 400 with a clear message for an invalid query', async () => {
    const res = await GET(context('?language=en&id=1&size=banner'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('size must be one of')
  })

  it('returns 404 for an unknown question id', async () => {
    const res = await GET(context('?language=en&id=not-a-real-id&size=og'))
    expect(res.status).toBe(404)
  })
})
