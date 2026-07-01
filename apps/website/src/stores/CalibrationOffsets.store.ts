// Per-preset mm calibration offsets (epic #19, ticket #40). A printer's drift is a
// property of that printer + that precut sheet, not of any one session, so the
// nudge a user dials in for a preset should survive a reload — same
// `persistentAtom` + JSON encode/decode pattern as `~stores/Game.store`'s
// `gameStore`, just keyed by preset instead of a single value.

import {persistentAtom} from '@nanostores/persistent'
import {action} from 'nanostores'
import type {LayoutId} from '~server/print/presets'

export type CalibrationOffset = {offsetX: number; offsetY: number}

export const ZERO_OFFSET: CalibrationOffset = {offsetX: 0, offsetY: 0}

type CalibrationOffsets = Partial<Record<LayoutId, CalibrationOffset>>

export const $calibrationOffsets = persistentAtom<CalibrationOffsets>(
  'who-print-calibration',
  {},
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  }
)

/** The stored offset for `preset`, or `{offsetX: 0, offsetY: 0}` if none was ever set. */
export const getCalibrationOffset = (
  offsets: CalibrationOffsets,
  preset: LayoutId | undefined
): CalibrationOffset => (preset ? (offsets[preset] ?? ZERO_OFFSET) : ZERO_OFFSET)

export const setCalibrationOffset = action(
  $calibrationOffsets,
  'setCalibrationOffset',
  (store, preset: LayoutId, offset: CalibrationOffset) => {
    store.set({...store.get(), [preset]: offset})
  }
)
