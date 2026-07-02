import type {APIContext} from 'astro'
import {describe, expect, it} from 'vitest'

// Lives outside src/pages on purpose, same reasoning as
// src/server/print/endpoint.test.ts: Astro's file-based router treats every
// file under src/pages/** as a route, so a colocated test file would become a
// real (broken) route and break `astro build`'s prerender step.
import {GET} from '../pages/share-card/[size]/[language]/[id].png'

// `GET` only reads `params`, so a minimal fake context is enough — no need to
// spin up a full Astro request pipeline for these assertions.
const context = (params: Record<string, string | undefined>): APIContext => ({params}) as APIContext

describe('GET /share-card/[size]/[language]/[id].png', () => {
  it('returns a story PNG with immutable cache headers', async () => {
    const res = await GET(context({size: 'story', language: 'en', id: '1'}))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(1_000)
    // PNG magic bytes.
    expect(Buffer.from(bytes.slice(0, 8)).toString('hex')).toBe('89504e470d0a1a0a')
  })

  it('returns a post PNG with immutable cache headers', async () => {
    const res = await GET(context({size: 'post', language: 'en', id: '1'}))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('renders Hebrew (RTL) and Mandarin (CJK) at both sizes', async () => {
    for (const size of ['story', 'post']) {
      for (const language of ['he', 'zh']) {
        const res = await GET(context({size, language, id: '1'}))
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
      }
    }
  })

  it('404s for the og size (not served on this route)', async () => {
    const res = await GET(context({size: 'og', language: 'en', id: '1'}))
    expect(res.status).toBe(404)
  })

  it('404s for an unknown size', async () => {
    const res = await GET(context({size: 'poster', language: 'en', id: '1'}))
    expect(res.status).toBe(404)
  })

  it('404s for an unknown question id', async () => {
    const res = await GET(context({size: 'story', language: 'en', id: 'not-a-real-id'}))
    expect(res.status).toBe(404)
  })

  it('404s for a question with no text in the given language', async () => {
    const res = await GET(context({size: 'story', language: 'xx', id: '1'}))
    expect(res.status).toBe(404)
  })

  it('404s when a param is missing', async () => {
    const res = await GET(context({size: 'story', language: 'en', id: undefined}))
    expect(res.status).toBe(404)
  })
})
