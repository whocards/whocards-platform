import type {APIRoute} from 'astro'

import type {CardSizeKey} from '~server/card-image'
import {renderCardPng, SHARE_CARD_SIZE_KEYS} from '~server/card-image'

// On-demand Share Card image (epic #152, ticket #153): a Netlify function, not
// a prerendered/static route. Story (9:16) and post (4:5) sizes render the
// same design as /og/[language]/[id].png (src/server/card-image.ts is the
// single design source, ADR-0007) but can't be enumerated at build time the
// way the OG images are — mobile/web share sheets fetch these at share time,
// and Custom Deck questions (not in the static Pool) will need this same
// on-demand path once they ship.
export const prerender = false

/**
 * `GET /share-card/{size}/{language}/{id}.png`
 *
 * `size` is `story` (1080x1920) or `post` (1080x1350) — see
 * `SHARE_CARD_SIZE_KEYS`. The OG size stays at its own build-time route
 * (`/og/{language}/{id}.png`), not here. Unknown size/language/id all 404,
 * never a broken image.
 */
const isShareCardSize = (value: string): value is CardSizeKey =>
  (SHARE_CARD_SIZE_KEYS as readonly string[]).includes(value)

export const GET: APIRoute = async ({params}) => {
  const {size, language, id} = params
  if (!size || !language || !id || !isShareCardSize(size)) {
    return new Response('Not found', {status: 404})
  }

  try {
    const png = await renderCardPng(language, id, size)
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    return new Response(`Failed to render card: ${(error as Error).message}`, {status: 404})
  }
}
