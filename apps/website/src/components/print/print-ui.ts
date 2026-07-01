// Pure helpers for the print page UI (epic #19, tickets #39/#40). Kept free of
// React/DOM so they're cheaply unit-testable; the components consuming them live
// in Print.tsx.

import type {LayoutId, PhysicalLayout} from '../../server/print/presets'
import {OFFSET_LIMIT_MM, type PrintDeck} from '../../server/print/params'

/** Cards per sheet for a physical layout. */
export const layoutUpCount = (layout: PhysicalLayout): number => layout.cols * layout.rows

/**
 * Clamp a calibration mm nudge to the ±20mm range the print/calibration endpoints
 * accept (`OFFSET_LIMIT_MM` in ~server/print/params), and fall back to 0 for
 * non-finite input (e.g. a cleared number input mid-edit).
 */
export const clampOffsetMm = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(OFFSET_LIMIT_MM, Math.max(-OFFSET_LIMIT_MM, value))
}

/**
 * The preset tiles default to the first *supported* layout, in registry order, so the
 * page never opens on a "coming soon" tile. Returns `undefined` if nothing is supported
 * yet (shouldn't happen in practice, but keeps the UI from crashing if it does).
 */
export const getDefaultPresetId = (
  layouts: Record<LayoutId, PhysicalLayout>
): LayoutId | undefined => Object.values(layouts).find((layout) => layout.supported)?.id

/**
 * Builds the `/api/print.pdf` query URL for the selected deck/language/preset,
 * plus the calibration mm nudge (#40) — omitted from the query when both are 0 so
 * the common (uncalibrated) case keeps the tidy URL #39 shipped with.
 */
export const buildPrintDownloadUrl = (
  deck: PrintDeck,
  lang: string,
  preset: string,
  offsetX = 0,
  offsetY = 0
): string => {
  const search = new URLSearchParams({deck, lang, preset})
  if (offsetX !== 0) search.set('offsetX', String(offsetX))
  if (offsetY !== 0) search.set('offsetY', String(offsetY))
  return `/api/print.pdf?${search.toString()}`
}

/**
 * Builds the `/api/calibration.pdf` query URL (#40) for the selected preset + mm
 * nudge, mirroring `buildPrintDownloadUrl`'s offset handling.
 */
export const buildCalibrationDownloadUrl = (preset: string, offsetX = 0, offsetY = 0): string => {
  const search = new URLSearchParams({preset})
  if (offsetX !== 0) search.set('offsetX', String(offsetX))
  if (offsetY !== 0) search.set('offsetY', String(offsetY))
  return `/api/calibration.pdf?${search.toString()}`
}

/** The language codes present in `allCodes` but not in `enabledCodes` (order preserved). */
export const getDisabledLanguageCodes = (allCodes: string[], enabledCodes: string[]): string[] => {
  const enabled = new Set(enabledCodes)
  return allCodes.filter((code) => !enabled.has(code))
}
