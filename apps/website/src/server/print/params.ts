// Query-param validation for `GET /api/print.pdf` (epic #19, ticket #38).
// Kept separate from rendering so it's cheaply unit-testable and so the
// endpoint can return a precise 400 before any PDF work happens.

import {LANGUAGE_CODES} from '@whocards/decks'

import {resolveLayout} from './presets'

/**
 * Scripts not yet supported by the print renderer: Hebrew is RTL, Mandarin
 * and Japanese are CJK. All three are tracked in #41. Every other Pool
 * language is Latin or Cyrillic and is enabled here.
 */
const UNSUPPORTED_LANGUAGES = new Set(['he', 'zh', 'jp'])

/** The ~11 Latin/Cyrillic language codes the print endpoint accepts today. */
export const PRINT_LANGUAGES: string[] = LANGUAGE_CODES.filter((code) => !UNSUPPORTED_LANGUAGES.has(code))

/** Only the `library` deck (full 66-question Pool) is in scope for #38. */
export const PRINT_DECKS = ['library'] as const
export type PrintDeck = (typeof PRINT_DECKS)[number]

/** Calibration nudge is meant to absorb sub-cm printer drift, not re-lay the page. */
const OFFSET_LIMIT_MM = 20

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

const describeRaw = (raw: string | null): string => (raw === null ? 'missing' : JSON.stringify(raw))

const parseOffset = (raw: string | null, name: 'offsetX' | 'offsetY'): {ok: true; value: number} | {ok: false; error: string} => {
  if (raw === null || raw === '') return {ok: true, value: 0}
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return {ok: false, error: `${name} must be a finite number of millimetres (got ${describeRaw(raw)})`}
  }
  if (Math.abs(value) > OFFSET_LIMIT_MM) {
    return {ok: false, error: `${name} must be within ±${OFFSET_LIMIT_MM}mm (got ${value})`}
  }
  return {ok: true, value}
}

/** Parse + validate `?deck=&lang=&preset=&offsetX=&offsetY=` from a request URL. */
export const parsePrintParams = (search: URLSearchParams): ParsePrintParamsResult => {
  const deck = search.get('deck')
  if (deck !== 'library') {
    return {ok: false, error: `deck must be "library" (got ${describeRaw(deck)}) — other decks aren't supported yet`}
  }

  const lang = search.get('lang')
  if (!lang || !PRINT_LANGUAGES.includes(lang)) {
    return {
      ok: false,
      error: `lang must be one of: ${PRINT_LANGUAGES.join(', ')} (got ${describeRaw(lang)})`,
    }
  }

  const preset = search.get('preset')
  if (!preset) return {ok: false, error: 'preset is required (a layout id or SKU alias)'}
  const layout = resolveLayout(preset)
  if (!layout) return {ok: false, error: `unknown preset "${preset}"`}
  if (!layout.supported) {
    return {ok: false, error: `preset "${preset}" isn't supported yet (pending print calibration)`}
  }

  const offsetX = parseOffset(search.get('offsetX'), 'offsetX')
  if (!offsetX.ok) return offsetX
  const offsetY = parseOffset(search.get('offsetY'), 'offsetY')
  if (!offsetY.ok) return offsetY

  return {
    ok: true,
    value: {deck, lang, preset, offsetX: offsetX.value, offsetY: offsetY.value},
  }
}
