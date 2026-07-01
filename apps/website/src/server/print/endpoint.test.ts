import type {APIContext} from 'astro'
import {describe, expect, it} from 'vitest'

// This test lives outside src/pages on purpose: Astro's file-based router
// treats every file under src/pages/** as a route, so a colocated
// `print.pdf.test.ts` becomes a real (broken) `/api/print.pdf.test` route and
// breaks `astro build`'s prerender step.
import {GET} from '../../pages/api/print.pdf'

// `GET` only reads `url.searchParams`, so a minimal fake context is enough —
// no need to spin up a full Astro request pipeline for these assertions.
const context = (query: string): APIContext =>
  ({url: new URL(`https://whocards.cc/api/print.pdf${query}`)}) as APIContext

describe('GET /api/print.pdf', () => {
  it('returns a PDF with a plausible non-trivial byte size for a valid request', async () => {
    const res = await GET(context('?deck=library&lang=en&preset=avery-5371'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(5_000)
    // PDF magic bytes.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  }, 20_000)

  it('applies the mm offset via query params without error', async () => {
    const res = await GET(context('?deck=library&lang=en&preset=avery-5371&offsetX=2&offsetY=-1.5'))
    expect(res.status).toBe(200)
  }, 20_000)

  it('returns 400 with a clear message for an invalid deck', async () => {
    const res = await GET(context('?deck=ai-at-work&lang=en&preset=avery-5371'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('deck must be "library"')
  })

  it('returns 400 for an unknown language code', async () => {
    const res = await GET(context('?deck=library&lang=xx&preset=avery-5371'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('lang must be one of')
  })

  it('returns a real PDF for Hebrew (RTL), Mandarin and Japanese (CJK, #41)', async () => {
    for (const lang of ['he', 'zh', 'jp']) {
      const res = await GET(context(`?deck=library&lang=${lang}&preset=avery-5371`))
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/pdf')
      const bytes = new Uint8Array(await res.arrayBuffer())
      expect(bytes.byteLength).toBeGreaterThan(5_000)
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    }
  }, 30_000)

  it('returns 400 for an unknown preset', async () => {
    const res = await GET(context('?deck=library&lang=en&preset=not-a-real-sheet'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an un-calibrated ("supported: false") preset', async () => {
    const res = await GET(context('?deck=library&lang=en&preset=us-letter-cleanedge-8up'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("isn't supported yet")
  })

  it('returns 400 for a missing preset', async () => {
    const res = await GET(context('?deck=library&lang=en'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an offset outside the calibration range', async () => {
    const res = await GET(context('?deck=library&lang=en&preset=avery-5371&offsetX=999'))
    expect(res.status).toBe(400)
  })
})
