// Pure helpers for the /play Share sheet (epic #152, issue #155). Kept free of
// React/DOM state so they're cheaply unit-testable; the sheet component consuming
// them lives in ShareSheet.tsx.

/** The two on-demand Share Card sizes served by `/share-card/{size}/...` (ADR-0007). */
export type ShareImageFormat = 'story' | 'post'

/** The three rows offered by the sheet — mirrors `@whocards/observability/events`' ShareFormat. */
export type ShareFormat = 'link' | ShareImageFormat

/**
 * Builds the on-demand Share Card endpoint URL (PR #157): `/share-card/{size}/{language}/{id}.png`.
 * Relative — works the same whether fetched from the browser or prerendered on the server.
 */
export const buildShareCardUrl = (
  format: ShareImageFormat,
  language: string,
  questionId: string
): string => `/share-card/${format}/${language}/${questionId}.png`

/** Filename used for both the shared `File` and the desktop download fallback. */
export const buildShareCardFilename = (
  format: ShareImageFormat,
  language: string,
  questionId: string
): string => `whocards-${format}-${questionId}-${language}.png`

/**
 * The minimal `Navigator` surface this module reads — lets tests pass a plain
 * object instead of stubbing the real `navigator` global.
 */
export type NavigatorLike = {
  canShare?: (data?: ShareData) => boolean
}

/**
 * Feature-detects file-sharing support (mobile Safari/Chrome's OS share sheet,
 * reaching Instagram/WhatsApp/etc.) using a tiny dummy PNG `File` — this lets the
 * sheet decide the "share via OS sheet" vs "download" labels at RENDER time,
 * before any real Share Card has been fetched, so the label a player sees is
 * never dishonest about what tapping it will do (#155).
 *
 * Desktop browsers overwhelmingly lack `navigator.canShare`/`share` entirely, so
 * they fall through to `false` (download) without needing the try/catch at all;
 * the try/catch only guards browsers whose `canShare` throws on an unexpected
 * `ShareData` shape.
 */
export const supportsFileShare = (nav: NavigatorLike | undefined): boolean => {
  if (!nav || typeof nav.canShare !== 'function') return false
  try {
    const probe = new File(['probe'], 'probe.png', {type: 'image/png'})
    return nav.canShare({files: [probe]})
  } catch {
    return false
  }
}

/** Row copy for an image format, honest about what the tap will do (share vs download). */
export const getImageRowLabel = (format: ShareImageFormat, canShareFiles: boolean): string => {
  const noun = format === 'story' ? 'Story image' : 'Post image'
  return canShareFiles ? noun : `Download ${noun.charAt(0).toLowerCase()}${noun.slice(1)}`
}
