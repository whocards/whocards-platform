import {createHash} from 'node:crypto'

import sharp from 'sharp'
import {describe, expect, it} from 'vitest'

import {
  autofitEstimateForTest,
  CARD_SIZES,
  renderCardPng,
  renderCardSvgForTest,
  SHARE_CARD_SIZE_KEYS,
} from './card-image'
import questions from '~data/questions.json'

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

// Satori emits a clip mask (`<mask id="satori_om-id-0">...<rect .../></mask>`)
// for the question-text div right after the two full-canvas background rects
// — its `y` is exactly where that div's content box landed. This is the
// cheapest available signal for "did the text actually move", short of
// decoding pixels: `justifyContent` on a flex container only affects the
// MAIN axis, which defaults to row (horizontal) — so a `verticalAlign:
// 'center'` that isn't paired with `flexDirection: 'column'` silently no-ops
// and the text stays pinned to the top, indistinguishable from `og`.
const textBoxY = (svg: string): number => {
  const match = svg.match(/<mask id="satori_om-id-0"><rect x="[\d.]+" y="([\d.]+)"/)
  if (!match) throw new Error('expected a satori_om-id-0 clip mask in the SVG')
  return Number(match[1])
}

// Same clip-mask signal as textBoxY, but the full box (top + height) — used by
// the wordmark-clearance regression tests below to check the rendered text
// block's actual bottom edge against the autofit's own budget.
const questionTextBounds = (svg: string): {top: number; bottom: number} => {
  const match = svg.match(
    /<mask id="satori_om-id-0"><rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/
  )
  if (!match) throw new Error('expected a satori_om-id-0 clip mask in the SVG')
  const top = Number(match[1])
  return {top, bottom: top + Number(match[2])}
}

describe('question text vertical layout (regression: flex row vs column)', () => {
  it('OG keeps the original top-aligned design (text box starts at the top padding)', async () => {
    const svg = await renderCardSvgForTest('en', '1', 'og')
    expect(textBoxY(svg)).toBe(CARD_SIZES.og.padding)
  })

  // The +200 margin below was tuned against the pre-#161 flat width-ratio
  // font scale (story/post text sat small in the middle of the frame, so a
  // centred block left a big top margin). #161's autofit deliberately grows
  // the block to hold the frame, which shrinks that margin — a smaller +40
  // still clearly distinguishes "centred" from "pinned to the top padding"
  // (which would put y exactly at `padding`, offset 0) without being tied to
  // the old, now-intentionally-smaller, gap.
  it('story centers the text block well below the top padding', async () => {
    const svg = await renderCardSvgForTest('en', '1', 'story')
    const y = textBoxY(svg)
    expect(y).toBeGreaterThan(CARD_SIZES.story.padding + 40)
    expect(y).toBeLessThan(CARD_SIZES.story.height - CARD_SIZES.story.padding)
  })

  it('post centers the text block well below the top padding', async () => {
    const svg = await renderCardSvgForTest('en', '1', 'post')
    const y = textBoxY(svg)
    expect(y).toBeGreaterThan(CARD_SIZES.post.padding + 40)
    expect(y).toBeLessThan(CARD_SIZES.post.height - CARD_SIZES.post.padding)
  })

  it('centers Hebrew (RTL) story text too, not just LTR', async () => {
    const svg = await renderCardSvgForTest('he', '1', 'story')
    const y = textBoxY(svg)
    expect(y).toBeGreaterThan(CARD_SIZES.story.padding + 40)
    expect(y).toBeLessThan(CARD_SIZES.story.height - CARD_SIZES.story.padding)
  })
})

// A short RTL question is a single unwrapped line, which sits in a
// shrink-to-fit flex item — `textAlign: right` has no spare box width to
// shift text within, so without an explicit `justify-content` it silently
// hugs the flex default (left), indistinguishable from LTR. Multi-line RTL
// text doesn't show this (each wrapped line is close to the full column
// width already), which is why this needs its own short-text regression
// test rather than folding into the vertical-layout describe above.
//
// Downsampling first keeps this a coarse, fast bounding-box check (not a
// pixel-perfect one) — plenty for "which side did the text end up on".
const brightPixelColumnBounds = async (
  png: Buffer
): Promise<{minX: number; maxX: number; width: number}> => {
  const downscaledWidth = 216
  const {data, info} = await sharp(png)
    .resize({width: downscaledWidth})
    .raw()
    .toBuffer({resolveWithObject: true})
  const {width, height, channels} = info
  const brightnessThreshold = 150 // background is ~0x26, question text is ~0xf5
  let minX = width
  let maxX = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const red = data[(y * width + x) * channels]
      if (red !== undefined && red > brightnessThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
  }
  return {minX, maxX, width}
}

describe('RTL single-line alignment (regression: shrink-to-fit flex item ignores textAlign)', () => {
  // Question 8 is the shortest Hebrew question in the dataset ("מה יקר
  // לליבך?", 13 chars) — short enough to stay a single unwrapped line at
  // both story and post's (much bigger, post-#161) autofit sizes, which is
  // exactly the case that used to hug left regardless of `textAlign`.
  const shortestHebrewQuestionId = '8'

  it('right-anchors a short Hebrew question on story, not left', async () => {
    const png = await renderCardPng('he', shortestHebrewQuestionId, 'story')
    const {minX, maxX, width} = await brightPixelColumnBounds(png)
    // Right-anchored: text should end close to the right padding, with a
    // clear empty margin on the left. Hugging left (the bug) puts minX
    // right at the left padding (~16/216 downscaled px here) instead.
    expect(maxX).toBeGreaterThan(width * 0.85)
    expect(minX).toBeGreaterThan(width * 0.15)
  })

  it('right-anchors a short Hebrew question on post, not left', async () => {
    const png = await renderCardPng('he', shortestHebrewQuestionId, 'post')
    const {minX, maxX, width} = await brightPixelColumnBounds(png)
    expect(maxX).toBeGreaterThan(width * 0.85)
    expect(minX).toBeGreaterThan(width * 0.15)
  })
})

// #161 found a real overflow bug on the way to bigger story/post type: a flat
// font-scale multiplier (tuned against Latin/Hebrew's narrower average glyph)
// sent a long CJK question — full-width characters, much wider per character
// — past both the top of the canvas and into the wordmark. This guards the
// autofit that replaced it: the rendered block must stay within the frame
// and clear the wordmark, for the longest real question in each language.
//
// Note the longest question isn't the same id for every language: id 29 is
// longest for en/he/jp, but for zh specifically id 21 is longer (45 chars vs
// 29's 42) — and 21 is also a multi-paragraph (`\n\n`) question, exactly the
// shape that exposed the wordmark-collision regression fixed alongside this
// test (see the describe block below). Using 29 for zh here would silently
// miss that shape.
describe('autofit never overflows the frame or the wordmark (regression: CJK width underestimate)', () => {
  it.each(['story', 'post'] as const)('%s: Mandarin stays within the frame', async (sizeKey) => {
    const svg = await renderCardSvgForTest('zh', '21', sizeKey)
    const {top, bottom} = questionTextBounds(svg)
    const size = CARD_SIZES[sizeKey]
    expect(top).toBeGreaterThanOrEqual(size.padding)
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceForTest(size))
  })

  it.each(['story', 'post'] as const)('%s: Japanese stays within the frame', async (sizeKey) => {
    const svg = await renderCardSvgForTest('jp', '29', sizeKey)
    const {top, bottom} = questionTextBounds(svg)
    const size = CARD_SIZES[sizeKey]
    expect(top).toBeGreaterThanOrEqual(size.padding)
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceForTest(size))
  })
})

// Reviewer-confirmed regression (#169): the autofit's line-count estimate
// used to flatten `\n`/`\n\n` (forced paragraph breaks — a real pattern in
// the dataset, e.g. "...?\n\nWhy?") into a single space before estimating
// wrapped lines, so it never counted the extra line(s) they force. That
// undercounted the block height enough to let real text render behind the
// wordmark for ~13.5% of (id, language, size) combinations with an embedded
// `\n`. These three are the reviewer's confirmed worst offenders (up to
// -119px past the wordmark clearance boundary before the fix) — pinned here
// with real Satori renders, not just the estimate math the sweep below uses.
describe('autofit clears the wordmark for multi-paragraph (\\n\\n) questions (regression: #169)', () => {
  const cases = [
    {language: 'he', id: '4', sizeKey: 'story'},
    {language: 'jp', id: '35', sizeKey: 'story'},
    {language: 'zh', id: '21', sizeKey: 'story'},
    {language: 'zh', id: '21', sizeKey: 'post'},
  ] as const

  it.each(cases)('$language/$id/$sizeKey clears the wordmark', async ({language, id, sizeKey}) => {
    const svg = await renderCardSvgForTest(language, id, sizeKey)
    const {top, bottom} = questionTextBounds(svg)
    const size = CARD_SIZES[sizeKey]
    expect(top).toBeGreaterThanOrEqual(size.padding)
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceForTest(size))
  })
})

// Wordmark clearance mirrors fontSizeFor's own reservation (52px glyph *
// wordmarkScale, plus a breathing gap) so the tests above stay in lockstep
// with the autofit's own budget rather than duplicating a second magic
// number that could silently drift from the real one.
const wordmarkClearanceForTest = (size: (typeof CARD_SIZES)[keyof typeof CARD_SIZES]): number =>
  Math.round(52 * size.wordmarkScale + 60)

// Full-dataset sweep (reviewer-requested): every question id containing a
// `\n` in ANY language, every language it has text for, both on-demand
// sizes — asserting the autofit's own projected block height never crosses
// its own wordmark-clearance budget. This is estimate-math level (calls
// autofitEstimateForTest, not a real Satori render, for ~500 combinations)
// so it stays fast; the three worst real offenders are pinned with actual
// renders in the describe block above instead.
describe('autofit sweep: every multi-paragraph question, every language, every on-demand size (regression: #169)', () => {
  const multiParagraphCases: {id: string; language: string}[] = []
  for (const [id, entry] of Object.entries(questions as Record<string, Record<string, string>>)) {
    for (const [language, text] of Object.entries(entry)) {
      if (text.includes('\n')) multiParagraphCases.push({id, language})
    }
  }

  it('found at least one multi-paragraph case to sweep (sanity check the sweep isn’t vacuous)', () => {
    expect(multiParagraphCases.length).toBeGreaterThan(0)
  })

  it('never projects the text block past the wordmark clearance', () => {
    const incursions: string[] = []
    for (const {id, language} of multiParagraphCases) {
      const text = (questions as Record<string, Record<string, string>>)[id]?.[language]
      if (text == null) continue
      for (const sizeKey of SHARE_CARD_SIZE_KEYS) {
        const size = CARD_SIZES[sizeKey]
        const {blockHeight, availableHeight} = autofitEstimateForTest(text, language, size)
        if (blockHeight > availableHeight) {
          incursions.push(
            `${language}/${id}/${sizeKey}: projected ${Math.round(blockHeight)}px vs ${Math.round(availableHeight)}px available (+${Math.round(blockHeight - availableHeight)}px over)`
          )
        }
      }
    }
    expect(incursions).toEqual([])
  })
})

// #161's hard constraint: the OG size must stay byte-identical to pre-#161
// output (fontSizeFor early-returns for `size.key === 'og'` specifically to
// guarantee this). That claim was previously only checked by a one-off manual
// `cmp` documented in the PR description — nothing would go red in CI if a
// future change to fontSizeFor, buildTree, or the maze/background pipeline
// broke it. Pinning a content hash here (checked into source, so a real
// change shows up as a normal diff) closes that gap. Regenerate these hashes
// only as a deliberate, reviewed OG-design change — never to "make the test
// pass".
const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

describe('OG output stays byte-identical (regression: no automated pin on the #161 hard constraint)', () => {
  // PINNED_OG_HASHES: computed once from a real render and checked in below.
  // A red test here means OG output changed — confirm that's an intentional,
  // reviewed design change (not a side effect of touching fontSizeFor /
  // buildTree / the maze pipeline) before updating the hash.
  const pinned: [language: string, id: string, sha256: string][] = [
    ['en', '1', '27e3ccef8c8c751f32eca8566416410ec18d1717e7f9f87bc92a3f6b835dc5fd'],
    ['he', '29', '1fcf6b6af57896cec5cbd268171aacb3f38b0e398572effa8d15e2ec25f200a8'],
    ['zh', '21', '928aa1537b3e40ce440ba3296f3751359e4811d9722d361cacb64daec6634614'],
  ]

  it.each(pinned)(
    '%s/%s OG render matches its pinned checksum',
    async (language, id, expectedHash) => {
      const png = await renderCardPng(language, id, 'og')
      expect(sha256(png)).toBe(expectedHash)
    }
  )
})
