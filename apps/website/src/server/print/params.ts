// Query-param validation for `GET /api/print.pdf` (epic #19, ticket #38).
// Kept separate from rendering so it's cheaply unit-testable and so the
// endpoint can return a precise 400 before any PDF work happens.

import {LANGUAGE_CODES} from '@whocards/decks'

import {resolveLayout} from './presets'

/**
 * Every Pool language is supported by the print renderer. Hebrew (RTL) and
 * Mandarin/Japanese (CJK) were the last gap — closed in #41 by bundling Noto
 * Sans Hebrew/Chinese/Japanese and adding bidi reordering + a CJK-aware wrap
 * mode in ./render and ./text-fit.
 *
 * This is the single source of truth the print UI (#39) derives its
 * enabled-language list from.
 */
export const PRINT_LANGUAGES: string[] = [...LANGUAGE_CODES]

/** Only the `library` deck (full 66-question Pool) is in scope for #38. */
export const PRINT_DECKS = ['library'] as const
export type PrintDeck = (typeof PRINT_DECKS)[number]

/**
 * Calibration nudge is meant to absorb sub-cm printer drift, not re-lay the page.
 * Exported: the calibration sheet endpoint (#40) accepts the same `offsetX`/`offsetY`
 * range and reuses `parseOffset` below rather than re-deriving the limit.
 */
export const OFFSET_LIMIT_MM = 20

export type PrintPdfParams = {
  deck: PrintDeck
  lang: string
  preset: string
  /** mm nudge applied to the whole grid; positive = right. */
  offsetX: number
  /** mm nudge applied to the whole grid; positive = down. */
  offsetY: number
}

export type ParsePrintParamsResult = {ok: true; value: PrintPdfParams} | {ok: false; error: string}

export const describeRaw = (raw: string | null): string =>
  raw === null ? 'missing' : JSON.stringify(raw)

/** Shared by print.pdf and calibration.pdf (#40) — both accept the same mm nudge. */
export const parseOffset = (
  raw: string | null,
  name: 'offsetX' | 'offsetY'
): {ok: true; value: number} | {ok: false; error: string} => {
  if (raw === null || raw === '') return {ok: true, value: 0}
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      error: `${name} must be a finite number of millimetres (got ${describeRaw(raw)})`,
    }
  }
  if (Math.abs(value) > OFFSET_LIMIT_MM) {
    return {ok: false, error: `${name} must be within ±${OFFSET_LIMIT_MM}mm (got ${value})`}
  }
  return {ok: true, value}
}

/**
 * Shared by print.pdf and calibration.pdf (#40) — both take a `preset` (layout id or
 * SKU alias) and both must refuse an unknown or un-calibrated ("supported: false") one.
 */
export const parsePresetParam = (
  raw: string | null
): {ok: true; value: string} | {ok: false; error: string} => {
  if (!raw) return {ok: false, error: 'preset is required (a layout id or SKU alias)'}
  const layout = resolveLayout(raw)
  if (!layout) return {ok: false, error: `unknown preset "${raw}"`}
  if (!layout.supported) {
    return {ok: false, error: `preset "${raw}" isn't supported yet (pending print calibration)`}
  }
  return {ok: true, value: raw}
}

/** Parse + validate `?deck=&lang=&preset=&offsetX=&offsetY=` from a request URL. */
export const parsePrintParams = (search: URLSearchParams): ParsePrintParamsResult => {
  const deck = search.get('deck')
  if (deck !== 'library') {
    return {
      ok: false,
      error: `deck must be "library" (got ${describeRaw(deck)}) — other decks aren't supported yet`,
    }
  }

  const lang = search.get('lang')
  if (!lang || !PRINT_LANGUAGES.includes(lang)) {
    return {
      ok: false,
      error: `lang must be one of: ${PRINT_LANGUAGES.join(', ')} (got ${describeRaw(lang)})`,
    }
  }

  const parsedPreset = parsePresetParam(search.get('preset'))
  if (!parsedPreset.ok) return parsedPreset
  const preset = parsedPreset.value

  const offsetX = parseOffset(search.get('offsetX'), 'offsetX')
  if (!offsetX.ok) return offsetX
  const offsetY = parseOffset(search.get('offsetY'), 'offsetY')
  if (!offsetY.ok) return offsetY

  return {
    ok: true,
    value: {deck, lang, preset, offsetX: offsetX.value, offsetY: offsetY.value},
  }
}
