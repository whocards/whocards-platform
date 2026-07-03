import type {APIRoute} from 'astro'

import {renderCardPngForPlayground, ShareCardNotFoundError} from '~server/card-image'
import {parseImagePlaygroundCardParams} from '~server/dev-playground/params'

// Dev-only Share Card renderer for the Image Playground (issue #177):
// `GET /api/dev/image-playground/card.png?language=&id=&size=og|story|post
//   &padding=&wordmarkScale=&fontScale=&verticalAlign=&rtlJustify=
//   &cardOutline=true|false&theme=light|dark`
//
// This is the ONLY place in the codebase that accepts the design knobs
// (padding, wordmarkScale, fontScale, alignment) and the two experimental
// toggles (cardOutline, theme) as query params — the production endpoints
// (/og/[language]/[id].png, /share-card/[size]/[language]/[id].png) are
// untouched and never read these params. Hard dev-gated below, same pattern
// as the rest of this route tree — see src/pages/dev/image-playground.astro.
export const prerender = false

export const GET: APIRoute = async ({url}) => {
  if (!import.meta.env.DEV) {
    return new Response(null, {status: 404})
  }

  const parsed = parseImagePlaygroundCardParams(url.searchParams)
  if (!parsed.ok) {
    return new Response(JSON.stringify({error: parsed.error}), {
      status: 400,
      headers: {'content-type': 'application/json'},
    })
  }

  const {language, id, size, sizeOverrides, cardOutline, theme} = parsed.value

  try {
    const png = await renderCardPngForPlayground(language, id, size, sizeOverrides, {
      cardOutline,
      theme,
    })
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // Never cache — the whole point is iterating on params live.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error'
    const status = error instanceof ShareCardNotFoundError ? 404 : 500
    return new Response(JSON.stringify({error: message}), {
      status,
      headers: {'content-type': 'application/json'},
    })
  }
}
