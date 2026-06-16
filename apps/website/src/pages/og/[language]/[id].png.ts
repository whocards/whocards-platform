import type {APIRoute} from 'astro'

import {cardImagePaths, renderCardPng} from '~server/card-image'

/**
 * Build-time generated OG / social card image for a question in a language.
 *
 * Served at /og/{language}/{id}.png. With Astro's static output every
 * (language, id) pair is prerendered to a PNG file, so adding a question or
 * language needs NO committed image — just an entry in src/data/questions.json.
 */
export const getStaticPaths = () =>
  cardImagePaths().map(({language, id}) => ({params: {language, id}}))

export const GET: APIRoute = async ({params}) => {
  const {language, id} = params
  if (!language || !id) {
    return new Response('Not found', {status: 404})
  }

  try {
    const png = await renderCardPng(language, id)
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
