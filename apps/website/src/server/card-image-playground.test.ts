import {createHash} from 'node:crypto'

import {describe, expect, it} from 'vitest'

import {renderCardPngForPlayground, renderCardSvgForPlayground} from './card-image'

// Playground renderers for issue #177 (the dev-only Image Playground). These
// tests exercise the same code paths production renders through
// (renderSvg/renderPng/buildTree/buildMazeDataUri) but via the new
// playground-only exports, so — unlike card-image.test.ts's own pinned OG
// hashes (which hash the Satori SVG with the maze data URI stripped, for
// platform-independence — see that file — and this file deliberately does
// not touch), they're free to assert on cardOutline/theme/override behaviour
// that doesn't exist in production.

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

describe('renderCardPngForPlayground', () => {
  it('with no overrides/options, matches production renderCardPng byte-for-byte', async () => {
    // Direct byte comparison against the real production renderer (not a
    // re-pinned hash of our own) — proves the playground's "no overrides"
    // path is provably the same code path as renderCardPng, i.e. adding the
    // playground could not have perturbed production output. (This runs on
    // whatever platform CI happens to use, unlike card-image.test.ts's own
    // pin — see that file for why PNG bytes aren't pinned across platforms.)
    const {renderCardPng} = await import('./card-image')
    const [playground, production] = await Promise.all([
      renderCardPngForPlayground('en', '1', 'og'),
      renderCardPng('en', '1', 'og'),
    ])
    expect(sha256(playground)).toBe(sha256(production))
  })

  it('with no overrides/options, matches production for a story render too', async () => {
    const {renderCardPng} = await import('./card-image')
    const [playground, production] = await Promise.all([
      renderCardPngForPlayground('en', '5', 'story'),
      renderCardPng('en', '5', 'story'),
    ])
    expect(sha256(playground)).toBe(sha256(production))
  })

  it('cardOutline renders different bytes than the default (no outline)', async () => {
    const [withOutline, withoutOutline] = await Promise.all([
      renderCardPngForPlayground('en', '1', 'og', {}, {cardOutline: true}),
      renderCardPngForPlayground('en', '1', 'og', {}, {cardOutline: false}),
    ])
    expect(sha256(withOutline)).not.toBe(sha256(withoutOutline))
  })

  it('theme=light renders different bytes than the default dark theme', async () => {
    const [light, dark] = await Promise.all([
      renderCardPngForPlayground('en', '1', 'og', {}, {theme: 'light'}),
      renderCardPngForPlayground('en', '1', 'og', {}, {theme: 'dark'}),
    ])
    expect(sha256(light)).not.toBe(sha256(dark))
  })

  it('a padding override changes the rendered SVG', async () => {
    const [defaultRender, paddedRender] = await Promise.all([
      renderCardSvgForPlayground('en', '1', 'og'),
      renderCardSvgForPlayground('en', '1', 'og', {padding: 20}),
    ])
    expect(paddedRender.size.padding).toBe(20)
    expect(paddedRender.svg).not.toBe(defaultRender.svg)
  })

  it('an omitted override falls back to the preset default rather than becoming undefined', async () => {
    // Regression: a naive `{...base, ...overrides}` spread would let an
    // explicit `padding: undefined` in overrides stomp the real default —
    // the query-param parser always sets every override key (some to
    // `undefined`), so this must resolve to the preset's real value.
    const {size} = await renderCardSvgForPlayground('en', '1', 'story', {
      padding: undefined,
      wordmarkScale: undefined,
    })
    expect(size.padding).toBe(80) // CARD_SIZES.story.padding
    expect(size.wordmarkScale).toBe(1.45) // CARD_SIZES.story.wordmarkScale
  })

  it('throws ShareCardNotFoundError for an unknown question id', async () => {
    const {ShareCardNotFoundError} = await import('./card-image')
    await expect(renderCardPngForPlayground('en', 'not-a-real-id', 'og')).rejects.toBeInstanceOf(
      ShareCardNotFoundError
    )
  })
})
