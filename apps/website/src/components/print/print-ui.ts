// Pure helpers for the print page UI (epic #19, ticket #39). Kept free of React/DOM so
// they're cheaply unit-testable; the components consuming them live in Print.tsx.

import type {LayoutId, PhysicalLayout} from '../../server/print/presets'
import type {PrintDeck} from '../../server/print/params'

/** Cards per sheet for a physical layout. */
export const layoutUpCount = (layout: PhysicalLayout): number => layout.cols * layout.rows

/**
 * The preset tiles default to the first *supported* layout, in registry order, so the
 * page never opens on a "coming soon" tile. Returns `undefined` if nothing is supported
 * yet (shouldn't happen in practice, but keeps the UI from crashing if it does).
 */
export const getDefaultPresetId = (
  layouts: Record<LayoutId, PhysicalLayout>
): LayoutId | undefined => Object.values(layouts).find((layout) => layout.supported)?.id

/** Builds the `/api/print.pdf` query URL for the selected deck/language/preset. */
export const buildPrintDownloadUrl = (deck: PrintDeck, lang: string, preset: string): string => {
  const search = new URLSearchParams({deck, lang, preset})
  return `/api/print.pdf?${search.toString()}`
}

/** The language codes present in `allCodes` but not in `enabledCodes` (order preserved). */
export const getDisabledLanguageCodes = (allCodes: string[], enabledCodes: string[]): string[] => {
  const enabled = new Set(enabledCodes)
  return allCodes.filter((code) => !enabled.has(code))
}
