// Query-param validation for the dev-only Image Playground's Share Card
// endpoint (`GET /api/dev/image-playground/card.png`, issue #177). Mirrors
// the shape of ../print/params.ts (kept separate from rendering so it's
// cheaply unit-testable and the endpoint can return a precise 400 before any
// Satori/resvg work happens) — but lives under server/dev-playground, not
// server/print or server alongside card-image.ts, so deleting the playground
// later is "delete this directory + the two dev-only pages" and nothing in
// production server code needs to change.

import type {CardSize, CardSizeKey} from '~server/card-image'
import {CARD_SIZES} from '~server/card-image'

export const describeRaw = (raw: string | null): string =>
  raw === null ? 'missing' : JSON.stringify(raw)

const CARD_SIZE_KEYS = Object.keys(CARD_SIZES) as CardSizeKey[]

const isCardSizeKey = (value: string): value is CardSizeKey =>
  (CARD_SIZE_KEYS as string[]).includes(value)

export type ParamResult<T> = {ok: true; value: T} | {ok: false; error: string}

/** A bounded numeric override — generous enough for real exploration, tight enough to reject garbage. */
const parseBoundedNumber = (
  raw: string | null,
  name: string,
  min: number,
  max: number
): ParamResult<number | undefined> => {
  if (raw === null || raw === '') return {ok: true, value: undefined}
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return {ok: false, error: `${name} must be a finite number (got ${describeRaw(raw)})`}
  }
  if (value < min || value > max) {
    return {ok: false, error: `${name} must be between ${min} and ${max} (got ${value})`}
  }
  return {ok: true, value}
}

const parseEnum = <T extends string>(
  raw: string | null,
  name: string,
  allowed: readonly T[]
): ParamResult<T | undefined> => {
  if (raw === null || raw === '') return {ok: true, value: undefined}
  if (!(allowed as readonly string[]).includes(raw)) {
    return {
      ok: false,
      error: `${name} must be one of: ${allowed.join(', ')} (got ${describeRaw(raw)})`,
    }
  }
  return {ok: true, value: raw as T}
}

const parseBoolean = (raw: string | null, name: string): ParamResult<boolean> => {
  if (raw === null || raw === '') return {ok: true, value: false}
  if (raw === 'true') return {ok: true, value: true}
  if (raw === 'false') return {ok: true, value: false}
  return {ok: false, error: `${name} must be "true" or "false" (got ${describeRaw(raw)})`}
}

export type ImagePlaygroundCardParams = {
  language: string
  id: string
  size: CardSizeKey
  sizeOverrides: Partial<
    Pick<CardSize, 'padding' | 'wordmarkScale' | 'fontScale' | 'verticalAlign' | 'rtlJustify'>
  >
  cardOutline: boolean
  theme: 'light' | 'dark'
}

// Generous bounds — this endpoint only ever runs in `astro dev`, rendering a
// handful of on-demand previews for one developer, not production traffic —
// wide enough to explore, tight enough that a typo (`padding=9999999`) fails
// fast with a clear message instead of Satori hanging on an absurd layout.
const PADDING_RANGE = [0, 400] as const
const SCALE_RANGE = [0.1, 4] as const

/** Parse + validate `?language=&id=&size=&padding=&wordmarkScale=&fontScale=&verticalAlign=&rtlJustify=&cardOutline=&theme=`. */
export const parseImagePlaygroundCardParams = (
  search: URLSearchParams
): ParamResult<ImagePlaygroundCardParams> => {
  const language = search.get('language')
  if (!language) return {ok: false, error: `language is required (got ${describeRaw(language)})`}

  const id = search.get('id')
  if (!id) return {ok: false, error: `id is required (got ${describeRaw(id)})`}

  const size = search.get('size')
  if (!size || !isCardSizeKey(size)) {
    return {
      ok: false,
      error: `size must be one of: ${CARD_SIZE_KEYS.join(', ')} (got ${describeRaw(size)})`,
    }
  }

  const padding = parseBoundedNumber(search.get('padding'), 'padding', ...PADDING_RANGE)
  if (!padding.ok) return padding
  const wordmarkScale = parseBoundedNumber(
    search.get('wordmarkScale'),
    'wordmarkScale',
    ...SCALE_RANGE
  )
  if (!wordmarkScale.ok) return wordmarkScale
  const fontScale = parseBoundedNumber(search.get('fontScale'), 'fontScale', ...SCALE_RANGE)
  if (!fontScale.ok) return fontScale
  const verticalAlign = parseEnum(search.get('verticalAlign'), 'verticalAlign', [
    'flex-start',
    'center',
  ] as const)
  if (!verticalAlign.ok) return verticalAlign
  const rtlJustify = parseEnum(search.get('rtlJustify'), 'rtlJustify', [
    'flex-start',
    'flex-end',
  ] as const)
  if (!rtlJustify.ok) return rtlJustify

  const cardOutline = parseBoolean(search.get('cardOutline'), 'cardOutline')
  if (!cardOutline.ok) return cardOutline
  const theme = parseEnum(search.get('theme'), 'theme', ['light', 'dark'] as const)
  if (!theme.ok) return theme

  return {
    ok: true,
    value: {
      language,
      id,
      size,
      sizeOverrides: {
        padding: padding.value,
        wordmarkScale: wordmarkScale.value,
        fontScale: fontScale.value,
        verticalAlign: verticalAlign.value,
        rtlJustify: rtlJustify.value,
      },
      cardOutline: cardOutline.value,
      theme: theme.value ?? 'dark',
    },
  }
}
