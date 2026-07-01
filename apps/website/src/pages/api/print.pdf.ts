import type {APIRoute} from 'astro'

import {parsePrintParams} from '../../server/print/params'
import {renderPrintPdf} from '../../server/print/render'

// On-demand print PDF (epic #19, ticket #38): a Netlify function, not a
// prerendered/static route — the site otherwise stays `output: 'static'`.
export const prerender = false

/**
 * `GET /api/print.pdf?deck=library&lang=en&preset=avery-5371&offsetX=0&offsetY=0`
 *
 * `deck` is `library` only for now (the full 66-question Pool). `preset` is a
 * physical layout id or SKU alias (see ~server/print/presets); unsupported /
 * un-calibrated presets are rejected with 400. `offsetX`/`offsetY` are an mm
 * nudge (±20mm) applied to the whole grid — the calibration seam from #40.
 */
export const GET: APIRoute = async ({url}) => {
  const parsed = parsePrintParams(url.searchParams)
  if (!parsed.ok) {
    return new Response(JSON.stringify({error: parsed.error}), {
      status: 400,
      headers: {'content-type': 'application/json'},
    })
  }

  // Buffer (not the raw Uint8Array pdf-lib returns) so this satisfies `BodyInit`.
  const pdf = Buffer.from(await renderPrintPdf(parsed.value))
  const filename = `whocards-${parsed.value.lang}-${parsed.value.preset}.pdf`

  return new Response(pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'content-length': String(pdf.byteLength),
    },
  })
}
