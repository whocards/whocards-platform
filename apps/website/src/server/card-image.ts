import {createHash, randomBytes} from 'node:crypto'
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import process from 'node:process'

import {Resvg} from '@resvg/resvg-js'
import bidiFactory from 'bidi-js'
import satori from 'satori'
import {decompress} from 'wawoff2'

import languages from '~data/languages.json'
import questions from '~data/questions.json'

/**
 * Programmatic generator for the per-question social/OG card images.
 *
 * Pipeline: question text -> Satori (HTML/CSS -> SVG) -> @resvg/resvg-js (SVG -> PNG).
 *
 * Fonts ship as woff2 in /public/fonts but Satori only understands ttf/otf/woff,
 * so we decompress the woff2 to ttf once (cached) with wawoff2.
 *
 * Adding a question or language requires NO committed PNGs: the card is rendered
 * from src/data/questions.json on demand (build-time prerender of the .png endpoint).
 */

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

const BG_COLOR = '#262434'
// The decorative maze lines are a darker tone-on-tone of the navy base.
const MAZE_COLOR = '#1e1d2a'
const TEXT_COLOR = '#f5f5f5'
const ACCENT_PURPLE = '#c058d2'
const ACCENT_YELLOW = '#f9d75f'

// Even padding around the card content (matches the original committed design).
const PADDING = 64

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

// Fonts (and the maze SVG) live in /public. Cards are prerendered at build time
// where the process cwd is the project root, so resolve from cwd (robust against
// the bundled module location, which import.meta.url would point to).
const publicDir = join(process.cwd(), 'public')
const fontDir = join(publicDir, 'fonts')

const ttfCache = new Map<FontKey, Promise<Buffer>>()

const loadTtf = (key: FontKey): Promise<Buffer> => {
  let cached = ttfCache.get(key)
  if (!cached) {
    cached = (async () => {
      const woff2 = await readFile(join(fontDir, FONT_FILES[key].file))
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

const fontsFor = async (
  language: string
): Promise<{name: string; data: Buffer; weight: number; style: 'normal'}[]> => {
  const scriptKey = LANGUAGE_FONT[language as LanguageCode]
  // Golos is the base (covers Latin question text), aptly renders the wordmark,
  // and the script-specific font is layered in for non-Latin question text.
  const keys: FontKey[] = scriptKey ? ['golos', 'aptly', scriptKey] : ['golos', 'aptly']
  const data = await Promise.all(keys.map(loadTtf))
  return keys.map((key, i) => ({
    name: FONT_FILES[key].family,
    data: data[i]!,
    weight: key === 'aptly' ? 700 : 400,
    style: 'normal' as const,
  }))
}

// The decorative maze pattern. The committed cards render `public/background.svg`
// as faint, darker tone-on-tone lines over the navy base. We recolour the maze
// paths to a solid dark fill, rasterise a card-aspect crop once, and cache the
// result as a PNG data URI to use as a Satori `backgroundImage`.
let mazeDataUri: Promise<string> | undefined

const buildMazeDataUri = (): Promise<string> => {
  if (!mazeDataUri) {
    mazeDataUri = (async () => {
      const raw = await readFile(join(publicDir, 'background.svg'), 'utf8')
      // The maze SVG is 2467x1722. Crop a card-aspect region from the top via a
      // viewBox and rasterise straight to the card size (no stretching).
      const MAZE_W = 2467
      const cropHeight = Math.round((MAZE_W * CARD_HEIGHT) / CARD_WIDTH)
      const svg = raw
        .replace(
          /^<svg[^>]*>/,
          `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${MAZE_W} ${cropHeight}" fill="none">`
        )
        .replace(/fill="url\(#b\)"/g, `fill="${MAZE_COLOR}"`)
        .replace(/fill-opacity="\.[0-9]+"/g, 'fill-opacity="1"')
      const resvg = new Resvg(svg, {
        fitTo: {mode: 'width', value: CARD_WIDTH},
        background: BG_COLOR,
      })
      const png = resvg.render().asPng()
      return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
    })()
  }
  return mazeDataUri
}

const isRtl = (language: string): boolean => RTL_LANGUAGES.has(language)

const bidi = bidiFactory()

// Rough max characters per visual line at a given font size, used to wrap RTL
// text before reordering (Satori in this version does no bidi reordering, so we
// reorder ourselves and feed it pre-broken visual-order lines).
const maxCharsPerLine = (fontSize: number): number =>
  Math.floor((CARD_WIDTH - 128) / (fontSize * 0.52))

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
const toVisualRtl = (text: string, fontSize: number): string => {
  const maxChars = maxCharsPerLine(fontSize)
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

/**
 * Pick a font size so the question fills as much of the card as possible while
 * still fitting. Short questions are set large; long ones auto-shrink.
 */
const fontSizeFor = (text: string): number => {
  const len = text.replace(/\s+/g, ' ').trim().length
  if (len <= 45) return 92
  if (len <= 70) return 82
  if (len <= 100) return 72
  if (len <= 140) return 58
  if (len <= 200) return 48
  return 42
}

// The brand wordmark: white "WHOCARDS.CC" in the Aptly title face followed by
// the two-tone question mark (magenta hook + yellow square dot), matching
// src/icons/logo.svg and the committed cards.
const Wordmark = () => ({
  type: 'div',
  props: {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '16px',
    },
    children: [
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontFamily: 'Aptly',
            fontSize: '44px',
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
            fontSize: '52px',
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
                  bottom: '2px',
                  left: '4px',
                  width: '13px',
                  height: '13px',
                  borderRadius: '3px',
                  backgroundColor: ACCENT_YELLOW,
                },
              },
            },
          ],
        },
      },
    ],
  },
})

const buildTree = (rawText: string, language: string, mazeUri: string) => {
  const rtl = isRtl(language)
  const fontFamily = `${fontFamilyFor(language)}, Golos Text`
  const fontSize = fontSizeFor(rawText)
  // For RTL we pre-reorder + pre-wrap the text and disable Satori wrapping;
  // for LTR we let Satori wrap normally.
  const text = rtl ? toVisualRtl(rawText, fontSize) : rawText
  return {
    type: 'div',
    props: {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: BG_COLOR,
        backgroundImage: `url(${mazeUri})`,
        backgroundSize: `${CARD_WIDTH}px ${CARD_HEIGHT}px`,
        padding: `${PADDING}px`,
      },
      children: [
        // Question text: top-aligned, filling the card with even margins.
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
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
              bottom: `${PADDING}px`,
              right: `${PADDING}px`,
              display: 'flex',
            },
            children: [Wordmark()],
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
// cwd (the website project root at build time), matching publicDir above.
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
          .map((name) => rm(join(cacheRoot, name), {recursive: true, force: true}).catch(() => {})),
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

/** Render the OG/social card PNG for a given language + question id. */
export const renderCardPng = async (language: string, id: string): Promise<Buffer> => {
  const entry = allQuestions[id]
  if (!entry) throw new Error(`Unknown question id: ${id}`)
  const text = entry[language]
  if (text == null) throw new Error(`Question ${id} has no text for language ${language}`)

  const cacheFile = join(cacheDir, `${cacheKey(text, language)}.png`)
  try {
    // Cache hit: a previous build already rendered this exact card.
    return await readFile(cacheFile)
  } catch {
    // Cache miss (or unreadable) — render it below and populate the cache.
  }

  const [fonts, mazeUri] = await Promise.all([fontsFor(language), buildMazeDataUri()])

  const svg = await satori(buildTree(text, language, mazeUri) as never, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
    loadAdditionalAsset: async () => '',
  })

  const resvg = new Resvg(svg, {
    fitTo: {mode: 'width', value: CARD_WIDTH},
    background: BG_COLOR,
  })
  const png = Buffer.from(resvg.render().asPng())

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
