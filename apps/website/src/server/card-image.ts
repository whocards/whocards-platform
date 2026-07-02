import {createHash, randomBytes} from 'node:crypto'
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import process from 'node:process'

import {Resvg} from '@resvg/resvg-js'
import bidiFactory from 'bidi-js'
import satori from 'satori'
import type {Font as FontOptions} from 'satori'
import {decompress} from 'wawoff2'

import {createBaseDirResolver} from './runtime-base-dir'
import type languages from '~data/languages.json'
import questions from '~data/questions.json'

/**
 * Programmatic generator for the per-question **Share Card** images (CONTEXT.md):
 * the build-time OG/social link-preview image, and the on-demand story (9:16) /
 * post (4:5) sizes served for sharing (ADR-0007). This module is the single
 * design source for all three — same navy maze background, auto-sized question
 * text, WHOCARDS.CC wordmark — parameterized over `CardSize` (see below).
 *
 * Pipeline: question text -> Satori (HTML/CSS -> SVG) -> @resvg/resvg-js (SVG -> PNG).
 *
 * Fonts ship as woff2 in /public/fonts but Satori only understands ttf/otf/woff,
 * so we decompress the woff2 to ttf once (cached) with wawoff2.
 *
 * Adding a question or language requires NO committed PNGs: every card is
 * rendered from src/data/questions.json — the OG size at build time (prerender
 * of the .png endpoint, persisted-cached below), the story/post sizes on demand
 * (Netlify function, never cached to disk — see `renderCardPng`).
 */

/** A Share Card output size. `key` doubles as the on-demand endpoint's URL segment. */
export type CardSizeKey = 'og' | 'story' | 'post'

type CardSize = {
  key: CardSizeKey
  width: number
  height: number
  // Even padding around the card content, in px at this size.
  padding: number
  // The wordmark is tuned for the OG size (44px/52px); other sizes scale it
  // by this factor rather than repeating the OG's absolute px values. OG's
  // landscape frame gives the wordmark plenty of relative weight at 1x; the
  // taller portrait sizes are viewed close-up (a phone screen, not a link
  // preview) and need a visibly bigger mark to still read as deliberate
  // rather than a shrunken afterthought in the corner.
  wordmarkScale: number
  // Question text scales off the OG breakpoint table (fontSizeFor's `base`)
  // by this factor. OG derives it from its own width (a no-op, factor 1);
  // story/post do NOT just scale by width like the wordmark does — both are
  // 1080px wide, but story is much taller (9:16 vs 4:5) and needs
  // noticeably bigger type to carry that extra vertical frame instead of
  // floating a small headline in a sea of background. Tuned by rendering
  // real PNGs (see docs/design/161-share-card-polish), not derived.
  fontScale: number
  // OG's design is top-aligned question text (matches the committed design
  // pixel-for-pixel). The taller portrait sizes centre the text block instead
  // between the top padding and the wordmark, which reads better on a 9:16/4:5
  // canvas than a wall of top-aligned text.
  verticalAlign: 'flex-start' | 'center'
  // A single-line RTL question sits in a shrink-to-fit flex item, so
  // `textAlign: right` has no box width left to move within — it visibly
  // hugs the left edge (flexbox's default justify-content), same as LTR,
  // even though multi-line RTL text (wrapped near the full column width)
  // reads as right-aligned. That quirk is baked into OG's committed,
  // byte-identical pixels (a past design already shipped and tested), so OG
  // keeps it; story/post are new enough at this design pass to fix it
  // properly with an explicit justify-content.
  rtlJustify: 'flex-start' | 'flex-end'
}

export const CARD_SIZES: Record<CardSizeKey, CardSize> = {
  og: {
    key: 'og',
    width: 1200,
    height: 630,
    padding: 64,
    wordmarkScale: 1,
    fontScale: 1,
    verticalAlign: 'flex-start',
    rtlJustify: 'flex-start',
  },
  story: {
    key: 'story',
    width: 1080,
    height: 1920,
    padding: 80,
    wordmarkScale: 1.45,
    fontScale: 1.85,
    verticalAlign: 'center',
    rtlJustify: 'flex-end',
  },
  post: {
    key: 'post',
    width: 1080,
    height: 1350,
    padding: 72,
    wordmarkScale: 1.2,
    fontScale: 1.4,
    verticalAlign: 'center',
    rtlJustify: 'flex-end',
  },
}

/** The on-demand Share Card sizes (excludes `og`, which stays build-time-only). */
export const SHARE_CARD_SIZE_KEYS = ['story', 'post'] as const satisfies readonly CardSizeKey[]

/**
 * Thrown for an expected "there's no such card" condition (unknown question
 * id, or no text for the given language) — as opposed to an unexpected
 * rendering/infra failure (a missing bundled font, a Satori/resvg crash).
 * Callers (the /og and /share-card endpoints) both 404 either way, but only
 * log the unexpected kind — see share-card's endpoint for why that split
 * matters in production.
 */
export class ShareCardNotFoundError extends Error {}

// Kept for callers that only care about the OG size (equal to CARD_SIZES.og).
export const CARD_WIDTH = CARD_SIZES.og.width
export const CARD_HEIGHT = CARD_SIZES.og.height

const BG_COLOR = '#262434'
// The decorative maze lines are a darker tone-on-tone of the navy base.
const MAZE_COLOR = '#1e1d2a'
const TEXT_COLOR = '#f5f5f5'
const ACCENT_PURPLE = '#c058d2'
const ACCENT_YELLOW = '#f9d75f'

type LanguageCode = keyof typeof languages
type Questions = Record<string, Record<string, string>>

const allQuestions = questions as Questions

// RTL languages in the dataset.
const RTL_LANGUAGES = new Set<string>(['he'])

// Map a language to the font that has glyph coverage for it. golos_text covers
// Latin + Cyrillic; CJK / Hebrew need their dedicated Noto subsets.
const LANGUAGE_FONT: Partial<Record<LanguageCode, FontKey>> = {
  he: 'hebrew',
  zh: 'chinese',
  jp: 'japanese',
}

type FontKey = 'golos' | 'aptly' | 'hebrew' | 'chinese' | 'japanese'

const FONT_FILES: Record<FontKey, {file: string; family: string}> = {
  golos: {file: 'golos_text.woff2', family: 'Golos Text'},
  // Condensed rounded title face used for the WHOCARDS.CC wordmark.
  aptly: {file: 'aptly_medium.woff2', family: 'Aptly'},
  hebrew: {file: 'noto-sans-hebrew_regular.woff2', family: 'Noto Sans Hebrew'},
  chinese: {file: 'noto-sans-chinese_regular.woff2', family: 'Noto Sans Chinese'},
  japanese: {file: 'noto-sans-japanese_regular.woff2', family: 'Noto Sans Japanese'},
}

// Fonts (and the maze SVG) live in /public. The OG size only ever renders at
// build time, where the process cwd is the astro project root — but the
// story/post sizes render on demand as a Netlify Function, whose cwd is NOT
// reliably the project root. See ./runtime-base-dir (shared with
// ./print/render.ts, which hit this exact problem first) for why.
const resolveBaseDir = createBaseDirResolver({
  probeRelativePath: join('public', 'fonts', FONT_FILES.golos.file),
  moduleUrl: import.meta.url,
  label: 'card-image',
})

const publicDir = (): string => join(resolveBaseDir(), 'public')
const fontDir = (): string => join(publicDir(), 'fonts')

const ttfCache = new Map<FontKey, Promise<Buffer>>()

const loadTtf = (key: FontKey): Promise<Buffer> => {
  let cached = ttfCache.get(key)
  if (!cached) {
    cached = (async () => {
      const woff2 = await readFile(join(fontDir(), FONT_FILES[key].file))
      const ttf = await decompress(woff2)
      return Buffer.from(ttf)
    })()
    ttfCache.set(key, cached)
  }
  return cached
}

const fontFamilyFor = (language: string): string => {
  const key = LANGUAGE_FONT[language as LanguageCode] ?? 'golos'
  return FONT_FILES[key].family
}

const fontsFor = async (language: string): Promise<FontOptions[]> => {
  const scriptKey = LANGUAGE_FONT[language as LanguageCode]
  // Golos is the base (covers Latin question text), aptly renders the wordmark,
  // and the script-specific font is layered in for non-Latin question text.
  const keys: FontKey[] = scriptKey ? ['golos', 'aptly', scriptKey] : ['golos', 'aptly']
  const data = await Promise.all(keys.map(loadTtf))
  return keys.map((key, i) => ({
    name: FONT_FILES[key].family,
    data: data[i],
    weight: (key === 'aptly' ? 700 : 400) as FontOptions['weight'],
    style: 'normal' as const,
  }))
}

// The decorative maze pattern. The committed cards render `public/background.svg`
// as faint, darker tone-on-tone lines over the navy base. We recolour the maze
// paths to a solid dark fill, rasterise a card-aspect crop once per size, and
// cache the result as a PNG data URI to use as a Satori `backgroundImage`.
//
// The source art is landscape (2467x1722, aspect ~1.433). The OG size
// (1200x630, aspect ~1.905) is *wider* than the source, so it crops a full-width
// strip from the top — the original approach. The story/post sizes are
// *taller* than the source (portrait), where a full-width top strip would need
// more vertical extent than the art has; those instead crop a full-height
// slice, centred horizontally, and fit to height.
const MAZE_SOURCE_WIDTH = 2467
const MAZE_SOURCE_HEIGHT = 1722
const MAZE_SOURCE_ASPECT = MAZE_SOURCE_WIDTH / MAZE_SOURCE_HEIGHT

const mazeDataUriCache = new Map<CardSizeKey, Promise<string>>()

const buildMazeDataUri = (size: CardSize): Promise<string> => {
  let cached = mazeDataUriCache.get(size.key)
  if (!cached) {
    cached = (async () => {
      const raw = await readFile(join(publicDir(), 'background.svg'), 'utf8')
      const targetAspect = size.width / size.height

      let viewBox: string
      let fitTo: {mode: 'width' | 'height'; value: number}
      if (targetAspect >= MAZE_SOURCE_ASPECT) {
        // Landscape (including OG): crop a full-width strip from the top.
        const cropHeight = Math.round(MAZE_SOURCE_WIDTH * (size.height / size.width))
        viewBox = `0 0 ${MAZE_SOURCE_WIDTH} ${cropHeight}`
        fitTo = {mode: 'width', value: size.width}
      } else {
        // Portrait: crop a full-height slice, centred horizontally.
        const cropWidth = Math.round(MAZE_SOURCE_HEIGHT * targetAspect)
        const xOffset = Math.round((MAZE_SOURCE_WIDTH - cropWidth) / 2)
        viewBox = `${xOffset} 0 ${cropWidth} ${MAZE_SOURCE_HEIGHT}`
        fitTo = {mode: 'height', value: size.height}
      }

      const svg = raw
        .replace(
          /^<svg[^>]*>/,
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="${viewBox}" fill="none">`
        )
        .replace(/fill="url\(#b\)"/g, `fill="${MAZE_COLOR}"`)
        .replace(/fill-opacity="\.[0-9]+"/g, 'fill-opacity="1"')
      const resvg = new Resvg(svg, {fitTo, background: BG_COLOR})
      const png = resvg.render().asPng()
      return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
    })()
    mazeDataUriCache.set(size.key, cached)
  }
  return cached
}

const isRtl = (language: string): boolean => RTL_LANGUAGES.has(language)

const bidi = bidiFactory()

// Rough max characters per visual line at a given font size, used to wrap RTL
// text before reordering (Satori in this version does no bidi reordering, so we
// reorder ourselves and feed it pre-broken visual-order lines).
const maxCharsPerLine = (fontSize: number, size: CardSize): number =>
  Math.floor((size.width - size.padding * 2) / (fontSize * 0.52))

const wrapLine = (line: string, maxChars: number): string[] => {
  if (line.length <= maxChars) return [line]
  const words = line.split(' ')
  const out: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      out.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) out.push(current)
  return out
}

// Reorder logical-order RTL text into visual order (with bracket mirroring) and
// wrap it, so Satori's plain LTR glyph placement renders it correctly.
const toVisualRtl = (text: string, fontSize: number, size: CardSize): string => {
  const maxChars = maxCharsPerLine(fontSize, size)
  const reorder = (line: string): string => {
    if (!line) return line
    const levels = bidi.getEmbeddingLevels(line, 'rtl')
    return bidi.getReorderedString(line, levels)
  }
  return text
    .split('\n')
    .flatMap((paragraph) => {
      if (paragraph === '') return ['']
      return wrapLine(paragraph, maxChars).map(reorder)
    })
    .join('\n')
}

// The OG breakpoint table: short questions are set large, long ones shrink in
// steps. Tuned for the OG size's 1200px landscape width — kept as its own
// function (rather than inlined) so story/post can use it as their *starting
// point* (via fontScale) without duplicating the thresholds.
const baseFontSizeFor = (len: number): number =>
  len <= 45 ? 92 : len <= 70 ? 82 : len <= 100 ? 72 : len <= 140 ? 58 : len <= 200 ? 48 : 42

// CJK glyphs are roughly full-width squares — much wider per character than
// a Latin/Hebrew average glyph — so a line-wrap estimate needs a different
// factor per script or it wildly under-counts lines for zh/jp. (Matches the
// spirit of maxCharsPerLine's RTL-only 0.52, generalized to every script the
// autofit below has to reason about.)
const avgCharWidthFactor = (language: string): number =>
  language === 'zh' || language === 'jp' ? 1.15 : 0.55

const AUTOFIT_LINE_HEIGHT = 1.2
const AUTOFIT_MIN_FONT_SIZE = 34
const AUTOFIT_STEP = 2
// The estimate above is a heuristic, not a real layout pass — Satori's actual
// wrap can land one line short/long of it (confirmed by rendering a long
// Japanese question: estimated 10 lines, Satori wrapped 11). Padding the
// estimated block height gives that a margin to be wrong in without the
// text actually reaching the wordmark.
const AUTOFIT_SAFETY_MARGIN = 1.08

/**
 * Pick a font size so the question fills as much of the card as possible
 * while still fitting — the whole point of this design pass (#161): a small
 * headline floating in a sea of background doesn't hold a 9:16/4:5 frame the
 * way it holds the wide OG frame.
 *
 * OG keeps its original, byte-identical table (`size.fontScale` is 1, a
 * no-op). Story/post start from that same table scaled *up* by their own
 * `fontScale` (bigger type, tuned by rendering real PNGs — see
 * docs/design/161-share-card-polish) and then shrink in steps, using an
 * estimated wrapped-line count, until the block is projected to fit the
 * available height without reaching the wordmark. Without this step a long
 * CJK question at story's fontScale overflows both the top of the canvas
 * and the wordmark — CJK characters are much wider than the Latin/Hebrew
 * case the flat scale was tuned against.
 */
const fontSizeFor = (text: string, language: string, size: CardSize): number => {
  const len = text.replace(/\s+/g, ' ').trim().length
  const base = baseFontSizeFor(len)
  if (size.key === 'og') return Math.round(base * size.fontScale)

  const availableWidth = size.width - size.padding * 2
  // Reserve room below the centred text block for the (now much bigger,
  // see CardSize.wordmarkScale) wordmark, so a long question can never grow
  // into it. Centering splits leftover space evenly top/bottom, so this
  // clearance is effectively "spent" on both sides — deliberately
  // conservative, matching the wordmark's own approximate glyph height plus
  // a breathing gap.
  const wordmarkClearance = Math.round(52 * size.wordmarkScale + 60)
  const availableHeight = size.height - size.padding * 2 - wordmarkClearance * 2
  const widthFactor = avgCharWidthFactor(language)

  let fontSize = Math.round(base * size.fontScale)
  while (fontSize > AUTOFIT_MIN_FONT_SIZE) {
    const charsPerLine = Math.max(1, Math.floor(availableWidth / (fontSize * widthFactor)))
    const lines = Math.ceil(len / charsPerLine)
    const blockHeight = lines * fontSize * AUTOFIT_LINE_HEIGHT * AUTOFIT_SAFETY_MARGIN
    if (blockHeight <= availableHeight) break
    fontSize -= AUTOFIT_STEP
  }
  return fontSize
}

// The brand wordmark: white "WHOCARDS.CC" in the Aptly title face followed by
// the two-tone question mark (magenta hook + yellow square dot), matching
// src/icons/logo.svg and the committed cards. `scale` is 1 at the OG size
// (giving the original absolute px values) and <1 for the smaller-width
// story/post canvases.
const Wordmark = (scale: number) => {
  const px = (value: number) => `${Math.round(value * scale)}px`
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: px(16),
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontFamily: 'Aptly',
              fontSize: px(44),
              fontWeight: 700,
              color: TEXT_COLOR,
            },
            children: 'WHOCARDS.CC',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              display: 'flex',
              fontFamily: 'Aptly',
              fontSize: px(52),
              fontWeight: 700,
              color: ACCENT_PURPLE,
            },
            children: [
              '?',
              // Yellow square dot overlays the magenta glyph's own dot.
              {
                type: 'div',
                props: {
                  style: {
                    position: 'absolute',
                    bottom: px(2),
                    left: px(4),
                    width: px(13),
                    height: px(13),
                    borderRadius: px(3),
                    backgroundColor: ACCENT_YELLOW,
                  },
                },
              },
            ],
          },
        },
      ],
    },
  }
}

const buildTree = (rawText: string, language: string, mazeUri: string, size: CardSize) => {
  const rtl = isRtl(language)
  const fontFamily = `${fontFamilyFor(language)}, Golos Text`
  const fontSize = fontSizeFor(rawText, language, size)
  // For RTL we pre-reorder + pre-wrap the text and disable Satori wrapping;
  // for LTR we let Satori wrap normally.
  const text = rtl ? toVisualRtl(rawText, fontSize, size) : rawText
  return {
    type: 'div',
    props: {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        // Flex's default direction is row, where justifyContent controls the
        // HORIZONTAL axis — not what CardSize.verticalAlign means. Explicitly
        // set column so justifyContent centers/top-aligns the question text
        // block vertically (the only flow child; the wordmark below is
        // absolutely positioned and doesn't participate in this layout).
        flexDirection: 'column',
        justifyContent: size.verticalAlign,
        backgroundColor: BG_COLOR,
        backgroundImage: `url(${mazeUri})`,
        backgroundSize: `${size.width}px ${size.height}px`,
        padding: `${size.padding}px`,
      },
      children: [
        // Question text: filling the card width with even margins. Top-aligned
        // for OG (the original design); vertically centred for the taller
        // portrait sizes (see CardSize.verticalAlign).
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              // A shrink-to-fit single line (short RTL question) has no
              // spare box width for `textAlign` to shift text within, so it
              // silently hugs the flex default (flex-start/left) unless we
              // justify the flex item itself — see CardSize.rtlJustify.
              justifyContent: rtl ? size.rtlJustify : 'flex-start',
              fontFamily,
              fontSize: `${fontSize}px`,
              fontWeight: 400,
              lineHeight: 1.2,
              color: TEXT_COLOR,
              // RTL text is already wrapped into visual lines, so use `pre`
              // to keep those breaks; LTR wraps naturally with pre-wrap.
              whiteSpace: rtl ? 'pre' : 'pre-wrap',
              textAlign: rtl ? 'right' : 'left',
              width: '100%',
            },
            children: text,
          },
        },
        // Wordmark anchored to the bottom-right corner with even margin. Absolute
        // so it never pushes or shrinks the question text.
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: `${size.padding}px`,
              right: `${size.padding}px`,
              display: 'flex',
            },
            children: [Wordmark(size.wordmarkScale)],
          },
        },
      ],
    },
  }
}

// Bump when the card *design* changes (layout, fonts, colours, sizing logic, the
// maze/background, or anything else that alters pixels) so the persisted build
// cache is invalidated. Content changes (question text / new languages) already
// bust the cache on their own via the per-card hash below.
const RENDERER_VERSION = '1'

// Persisted, content-addressed render cache. A card is a pure function of its
// (text, language, RENDERER_VERSION), so we cache the rendered PNG under a
// per-version dir keyed by a hash of (text, language) and reuse it across builds.
// Netlify restores/saves .cache/og between deploys (see netlify/plugins/og-cache),
// so a deploy that doesn't touch questions.json renders zero PNGs. Resolves from
// cwd (the website project root at build time — this path is only ever hit for
// the `og` size, which only ever renders at build time; see renderCardPng).
const cacheRoot = join(process.cwd(), '.cache', 'og')
const cacheDir = join(cacheRoot, `v${RENDERER_VERSION}`)
let cacheDirReady: Promise<unknown> | undefined
const ensureCacheDir = (): Promise<unknown> => {
  if (!cacheDirReady) {
    cacheDirReady = (async () => {
      await mkdir(cacheDir, {recursive: true}).catch(() => {})
      // Drop other-version dirs so a RENDERER_VERSION bump can't accumulate stale
      // renders in the persisted cache. Best-effort; only runs on a cache miss.
      const siblings = await readdir(cacheRoot).catch(() => [] as string[])
      await Promise.all(
        siblings
          .filter((name) => name !== `v${RENDERER_VERSION}`)
          .map((name) => rm(join(cacheRoot, name), {recursive: true, force: true}).catch(() => {}))
      )
    })()
  }
  return cacheDirReady
}

// Version lives in the dir (not the hash), so a bump lands in a fresh dir (all
// misses) and the old dir is pruned in ensureCacheDir. NUL-separated so no field
// value can collide with the next.
const cacheKey = (text: string, language: string): string =>
  createHash('sha256').update(`${language} ${text}`).digest('hex')

// Renders the Satori SVG for an already-resolved (text, language, size) —
// the layout step, before resvg rasterises it to PNG.
const renderSvg = async (text: string, language: string, size: CardSize): Promise<string> => {
  const [fonts, mazeUri] = await Promise.all([fontsFor(language), buildMazeDataUri(size)])
  return satori(buildTree(text, language, mazeUri, size) as never, {
    width: size.width,
    height: size.height,
    fonts,
    loadAdditionalAsset: async () => '',
  })
}

// Renders straight to PNG bytes for an already-resolved (text, language, size)
// — the part shared by the cached OG build path and the uncached on-demand
// story/post path below.
const renderPng = async (text: string, language: string, size: CardSize): Promise<Buffer> => {
  const svg = await renderSvg(text, language, size)
  const resvg = new Resvg(svg, {
    fitTo: {mode: 'width', value: size.width},
    background: BG_COLOR,
  })
  return Buffer.from(resvg.render().asPng())
}

/**
 * Render a Share Card PNG for a given language + question id, at `sizeKey`
 * (default `'og'`, the build-time link-preview size). The `og` size is the
 * only one that touches the persisted `.cache/og` build cache — the on-demand
 * story/post sizes (ADR-0007) always render fresh: they run as a Netlify
 * function, where there's no build cache directory to rely on, and the CDN's
 * immutable Cache-Control on the response already avoids re-rendering the
 * same (question, language, size) on every request.
 */
// Shared by renderCardPng and the test-only renderCardSvgForTest below.
const resolveQuestionText = (id: string, language: string): string => {
  const entry = allQuestions[id]
  if (!entry) throw new ShareCardNotFoundError(`Unknown question id: ${id}`)
  const text = entry[language]
  if (text == null) {
    throw new ShareCardNotFoundError(`Question ${id} has no text for language ${language}`)
  }
  return text
}

export const renderCardPng = async (
  language: string,
  id: string,
  sizeKey: CardSizeKey = 'og'
): Promise<Buffer> => {
  const text = resolveQuestionText(id, language)
  const size = CARD_SIZES[sizeKey]

  if (sizeKey !== 'og') {
    return renderPng(text, language, size)
  }

  const cacheFile = join(cacheDir, `${cacheKey(text, language)}.png`)
  try {
    // Cache hit: a previous build already rendered this exact card.
    return await readFile(cacheFile)
  } catch {
    // Cache miss (or unreadable) — render it below and populate the cache.
  }

  const png = await renderPng(text, language, size)

  // Best-effort, atomic cache write — never fail a build over the cache, and
  // never leave a truncated PNG (a killed build mid-write would otherwise be
  // restored and served as a corrupt image). Write to a temp file, then rename.
  await ensureCacheDir()
  const tmpFile = `${cacheFile}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmpFile, png)
    await rename(tmpFile, cacheFile)
  } catch {
    await rm(tmpFile, {force: true}).catch(() => {})
  }

  return png
}

/**
 * Exported for unit testing — renders the Satori SVG (pre-rasterisation) for
 * a card, so a test can assert on layout (e.g. the question text's vertical
 * position) without decoding a PNG. Never touches the build cache.
 */
export const renderCardSvgForTest = async (
  language: string,
  id: string,
  sizeKey: CardSizeKey = 'og'
): Promise<string> => {
  const text = resolveQuestionText(id, language)
  return renderSvg(text, language, CARD_SIZES[sizeKey])
}

/** Every (language, id) pair that has question text — used for static prerender. */
export const cardImagePaths = (): {language: string; id: string}[] => {
  const paths: {language: string; id: string}[] = []
  for (const [id, entry] of Object.entries(allQuestions)) {
    for (const language of Object.keys(entry)) {
      paths.push({language, id})
    }
  }
  return paths
}
