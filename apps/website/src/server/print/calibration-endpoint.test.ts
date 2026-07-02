import type {APIContext} from 'astro'
import {describe, expect, it} from 'vitest'

// This test lives outside src/pages on purpose: Astro's file-based router treats
// every file under src/pages/** as a route, so a colocated
// `calibration.pdf.test.ts` becomes a real (broken) `/api/calibration.pdf.test`
// route and breaks `astro build`'s prerender step (see endpoint.test.ts).
import {GET} from '../../pages/api/calibration.pdf'

const context = (query: string): APIContext =>
  ({url: new URL(`https://whocards.cc/api/calibration.pdf${query}`)}) as APIContext

describe('GET /api/calibration.pdf', () => {
  it('returns a PDF for a valid preset', async () => {
    const res = await GET(context('?preset=avery-5371'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(500)
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('applies the mm offset via query params without error', async () => {
    const res = await GET(context('?preset=avery-5371&offsetX=2&offsetY=-1.5'))
    expect(res.status).toBe(200)
  })

  it('returns 400 for a missing preset', async () => {
    const res = await GET(context(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('preset is required')
  })

  it('returns 400 for an unknown preset', async () => {
    const res = await GET(context('?preset=not-a-real-sheet'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an un-calibrated ("supported: false") preset', async () => {
    const res = await GET(context('?preset=us-letter-cleanedge-8up'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("isn't supported yet")
  })

  it('returns 400 for an offset outside the calibration range', async () => {
    const res = await GET(context('?preset=avery-5371&offsetX=999'))
    expect(res.status).toBe(400)
  })
})
