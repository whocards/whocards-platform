import {createHash} from 'node:crypto'

import sharp from 'sharp'
import {describe, expect, it} from 'vitest'

import {
  autofitEstimateForTest,
  CARD_SIZES,
  measureQuestionTextBlock,
  renderCardPng,
  renderCardSvgForTest,
  SHARE_CARD_SIZE_KEYS,
  wordmarkClearanceFor,
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
// block's actual bottom edge against the autofit's own budget. Delegates to
// card-image.ts's own measureQuestionTextBlock (rather than re-deriving the
// regex here) so the renderer's shrink-and-remeasure loop and this test suite
// share exactly one definition of "where did the text actually land".
const questionTextBounds = (svg: string): {top: number; bottom: number} => {
  const bounds = measureQuestionTextBlock(svg)
  if (!bounds) throw new Error('expected a satori_om-id-0 clip mask in the SVG')
  return bounds
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
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceFor(size))
  })

  it.each(['story', 'post'] as const)('%s: Japanese stays within the frame', async (sizeKey) => {
    const svg = await renderCardSvgForTest('jp', '29', sizeKey)
    const {top, bottom} = questionTextBounds(svg)
    const size = CARD_SIZES[sizeKey]
    expect(top).toBeGreaterThanOrEqual(size.padding)
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceFor(size))
  })
})

// Reviewer-confirmed regression (#169): the autofit's line-count estimate
// used to flatten `\n`/`\n\n` (forced paragraph breaks — a real pattern in
// the dataset, e.g. "...?\n\nWhy?") into a single space before estimating
// wrapped lines, so it never counted the extra line(s) they force. That
// undercounted the block height enough to let real text render behind the
// wordmark for ~13.5% of (id, language, size) combinations with an embedded
// `\n`. Fixing the estimate alone wasn't sufficient, though: a second review
// pass ran a REAL Satori sweep and found 20 more real incursions the fixed
// estimate still missed (up to -91px, e.g. hu/3/story) — the estimate's flat
// per-paragraph `Math.ceil(len / charsPerLine)` still undercounts Satori's
// actual word-wrap for some multi-paragraph Latin shapes. Rather than tuning
// the estimate/safety-margin harder against that next input shape too,
// renderSvg now measures the actual rendered block and shrinks-and-remeasures
// until it's verified clear (see renderSvg's doc comment) — these are the
// worst confirmed offenders from both passes, pinned with real Satori
// renders (not just the estimate math the fast sweep below uses).
describe('autofit clears the wordmark for multi-paragraph (\\n\\n) questions (regression: #169)', () => {
  const cases = [
    {language: 'he', id: '4', sizeKey: 'story'},
    {language: 'jp', id: '35', sizeKey: 'story'},
    {language: 'zh', id: '21', sizeKey: 'story'},
    {language: 'zh', id: '21', sizeKey: 'post'},
    // Worst offender found by the real-render re-verification pass: the
    // estimate-only fix still projected this as fitting.
    {language: 'hu', id: '3', sizeKey: 'story'},
  ] as const

  it.each(cases)('$language/$id/$sizeKey clears the wordmark', async ({language, id, sizeKey}) => {
    const svg = await renderCardSvgForTest(language, id, sizeKey)
    const {top, bottom} = questionTextBounds(svg)
    const size = CARD_SIZES[sizeKey]
    expect(top).toBeGreaterThanOrEqual(size.padding)
    expect(bottom).toBeLessThan(size.height - size.padding - wordmarkClearanceFor(size))
  })
})

// Every (id, language) pair with an embedded `\n`, from the real dataset —
// shared by both sweeps below so they can't silently drift apart on which
// cases they cover.
const multiParagraphCases: {id: string; language: string}[] = []
for (const [id, entry] of Object.entries(questions as Record<string, Record<string, string>>)) {
  for (const [language, text] of Object.entries(entry)) {
    if (text.includes('\n')) multiParagraphCases.push({id, language})
  }
}

// GROUND TRUTH sweep (reviewer-requested, regression: #169): every
// \n-containing question id, every language it has text for, both on-demand
// sizes — through the REAL renderer (renderCardSvgForTest -> actual Satori
// word-wrap -> measureQuestionTextBlock), asserting the rendered block never
// crosses the actual wordmark-clearance boundary. This is the test that
// actually caught the 20 real incursions the estimate-only sweep further
// below missed (the estimate can't see Satori's real word-wrap; only a real
// render can). ~518 combinations, but each is an SVG-only Satori call (no PNG
// rasterisation) with warm font/maze caches, so this runs in a few seconds —
// fast enough to stay in the default suite rather than needing a separate
// slow-test file.
describe('autofit REAL sweep: every multi-paragraph question, every language, every on-demand size, real Satori renders (regression: #169)', () => {
  it('found at least one multi-paragraph case to sweep (sanity check the sweep isn’t vacuous)', () => {
    expect(multiParagraphCases.length).toBeGreaterThan(0)
  })

  it('never renders the text block past the wordmark clearance', async () => {
    const incursions: string[] = []
    for (const {id, language} of multiParagraphCases) {
      for (const sizeKey of SHARE_CARD_SIZE_KEYS) {
        const size = CARD_SIZES[sizeKey]
        const svg = await renderCardSvgForTest(language, id, sizeKey)
        const bounds = measureQuestionTextBlock(svg)
        const limit = size.height - size.padding - wordmarkClearanceFor(size)
        if (!bounds || bounds.bottom > limit) {
          incursions.push(
            `${language}/${id}/${sizeKey}: rendered bottom ${bounds?.bottom ?? 'MISSING'}px vs ${limit}px limit`
          )
        }
      }
    }
    expect(incursions).toEqual([])
  })
})

// Fast, estimate-only sweep (not ground truth — see the REAL sweep above,
// which is what actually guards the invariant). This just checks that
// fontSizeFor's own starting-point estimate is in the right neighbourhood;
// it can't see Satori's real word-wrap, so a pass here does NOT guarantee no
// wordmark collision (that's exactly the gap that let 20 real incursions
// through review). Kept as a cheap early signal / for iterating on the
// estimate's tuning without paying for a real render.
describe('autofit sweep (estimate-only, fast — not authoritative): every multi-paragraph question, every language, every on-demand size', () => {
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
    // Informational, not a hard requirement — the estimate is a heuristic
    // starting point, and renderSvg's measure-and-correct loop is what
    // actually guarantees the invariant (see the REAL sweep above). Logged
    // rather than asserted so a "the estimate under-shot again" case doesn't
    // fail CI when the real renderer already corrects for it.
    if (incursions.length > 0) {
      console.info(
        `autofit estimate under-shot ${incursions.length} case(s) (corrected by renderSvg's measure loop):`,
        incursions
      )
    }
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
