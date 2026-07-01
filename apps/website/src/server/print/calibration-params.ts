// Query-param validation for `GET /api/calibration.pdf` (epic #19, ticket #40).
// Mirrors ./params's `parsePrintParams` shape but the calibration sheet doesn't
// render any Pool content, so it only needs `preset` + the mm nudge — no
// `deck`/`lang`. Both the preset and offset parsing are shared with ./params
// so the two endpoints can't drift on what a valid preset/offset looks like.

import {parseOffset, parsePresetParam} from './params'

export type CalibrationPdfParams = {
  preset: string
  /** mm nudge applied to the whole grid; positive = right. */
  offsetX: number
  /** mm nudge applied to the whole grid; positive = down. */
  offsetY: number
}

export type ParseCalibrationParamsResult =
  | {ok: true; value: CalibrationPdfParams}
  | {ok: false; error: string}

/** Parse + validate `?preset=&offsetX=&offsetY=` from a request URL. */
export const parseCalibrationParams = (search: URLSearchParams): ParseCalibrationParamsResult => {
  const parsedPreset = parsePresetParam(search.get('preset'))
  if (!parsedPreset.ok) return parsedPreset

  const offsetX = parseOffset(search.get('offsetX'), 'offsetX')
  if (!offsetX.ok) return offsetX
  const offsetY = parseOffset(search.get('offsetY'), 'offsetY')
  if (!offsetY.ok) return offsetY

  return {
    ok: true,
    value: {preset: parsedPreset.value, offsetX: offsetX.value, offsetY: offsetY.value},
  }
}
