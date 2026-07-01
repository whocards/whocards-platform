import type {APIRoute} from 'astro'

import {parseCalibrationParams} from '../../server/print/calibration-params'
import {renderCalibrationPdf} from '../../server/print/calibration'

// On-demand calibration sheet (epic #19, ticket #40): a Netlify function, not a
// prerendered/static route, mirroring print.pdf's `prerender = false`.
export const prerender = false

/**
 * `GET /api/calibration.pdf?preset=avery-5371&offsetX=0&offsetY=0`
 *
 * `preset` is a physical layout id or SKU alias (see ~server/print/presets);
 * unsupported / un-calibrated presets are rejected with 400. `offsetX`/`offsetY`
 * are the same mm nudge (±20mm) print.pdf accepts, so a user can reprint the
 * calibration sheet with a candidate offset already applied to confirm it lines
 * up before re-downloading their cards.
 */
export const GET: APIRoute = async ({url}) => {
  const parsed = parseCalibrationParams(url.searchParams)
  if (!parsed.ok) {
    return new Response(JSON.stringify({error: parsed.error}), {
      status: 400,
      headers: {'content-type': 'application/json'},
    })
  }

  // Buffer (not the raw Uint8Array pdf-lib returns) so this satisfies `BodyInit`.
  let pdf: Buffer<ArrayBuffer>
  try {
    pdf = Buffer.from(await renderCalibrationPdf(parsed.value))
  } catch (err) {
    console.error('calibration.pdf render failed:', err)
    return new Response(JSON.stringify({error: 'PDF rendering failed'}), {
      status: 500,
      headers: {'content-type': 'application/json'},
    })
  }
  const filename = `whocards-calibration-${parsed.value.preset}.pdf`

  return new Response(pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'content-length': String(pdf.byteLength),
    },
  })
}
