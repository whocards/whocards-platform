import {describe, expect, it} from 'vitest'

import {CARD_SIZES, renderCardPng} from './card-image'

// PNG's intrinsic width/height sit in the IHDR chunk, always the first chunk
// right after the 8-byte signature: 4-byte length, 4-byte "IHDR", then 4-byte
// width + 4-byte height (big-endian). Reading them directly is a cheap, exact
// way to assert output dimensions without a PNG-decoding dependency.
const pngDimensions = (png: Buffer): {width: number; height: number} => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
})

describe('renderCardPng size parameterization', () => {
  it('defaults to the OG size (1200x630)', async () => {
    const png = await renderCardPng('en', '1')
    expect(pngDimensions(png)).toEqual({width: CARD_SIZES.og.width, height: CARD_SIZES.og.height})
  })

  it('renders the story size (1080x1920)', async () => {
    const png = await renderCardPng('en', '1', 'story')
    expect(pngDimensions(png)).toEqual({width: 1080, height: 1920})
  })

  it('renders the post size (1080x1350)', async () => {
    const png = await renderCardPng('en', '1', 'post')
    expect(pngDimensions(png)).toEqual({width: 1080, height: 1350})
  })

  it('renders a real PNG (magic bytes) at every size', async () => {
    for (const sizeKey of ['og', 'story', 'post'] as const) {
      const png = await renderCardPng('en', '1', sizeKey)
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
  })

  it('renders Hebrew (RTL) at story and post without error', async () => {
    for (const sizeKey of ['story', 'post'] as const) {
      const png = await renderCardPng('he', '1', sizeKey)
      expect(pngDimensions(png)).toEqual({
        width: CARD_SIZES[sizeKey].width,
        height: CARD_SIZES[sizeKey].height,
      })
    }
  })

  it('renders Mandarin and Japanese (CJK) at story and post without error', async () => {
    for (const lang of ['zh', 'jp']) {
      for (const sizeKey of ['story', 'post'] as const) {
        const png = await renderCardPng(lang, '1', sizeKey)
        expect(pngDimensions(png)).toEqual({
          width: CARD_SIZES[sizeKey].width,
          height: CARD_SIZES[sizeKey].height,
        })
      }
    }
  })

  it('throws for an unknown question id', async () => {
    await expect(renderCardPng('en', 'not-a-real-id')).rejects.toThrow(/unknown question id/i)
  })

  it('throws for a question with no text in the given language', async () => {
    await expect(renderCardPng('xx', '1')).rejects.toThrow(/no text for language/i)
  })
})
