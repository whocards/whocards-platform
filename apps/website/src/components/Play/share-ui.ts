// Pure helpers for the /play Share sheet (epic #152, issue #155). Kept free of
// React/DOM state so they're cheaply unit-testable; the sheet component consuming
// them lives in ShareSheet.tsx.

import {DEFAULT_DECK_SLUG} from '@whocards/decks'
import type {DeckSource} from '@whocards/decks'

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

/**
 * Gates the Story/Post image rows on the deck being Pool-backed. The on-demand
 * `/share-card` endpoint only knows Pool ids (ADR-0007 — Custom Deck identity is
 * future work), so a deck that carries its own inline questions (CONTEXT.md's
 * "Deck either references the Pool or carries its Questions inline") cannot be
 * rendered by it. This is a structural check on the deck's declared source, NOT
 * a heuristic on the id — an inline deck can use numeric ids that collide with
 * unrelated Pool ids (e.g. hajnalig's 1-163 vs the Pool's 1-66), so guessing from
 * id shape would silently render the WRONG question's card.
 */
export const supportsShareImages = (source: DeckSource): boolean => source.kind === 'library'

/**
 * Builds the shareable web URL for a specific (deck, language, question) —
 * mirrors `apps/mobile/src/lib/share-url.ts`'s `buildShareUrl` exactly so web and
 * mobile share links agree: the default deck lives at `/play` (no path segment),
 * every other deck at `/play/<deckSlug>` (`/play/[deck].astro` resolves `?q=`
 * against THAT deck's own ids, so a deck-aware path is required for the link to
 * open the right question rather than falling back inside the library deck).
 */
export const buildQuestionShareUrl = (
  origin: string,
  deckSlug: string,
  language: string,
  questionId: string
): string => {
  const basePath = deckSlug === DEFAULT_DECK_SLUG ? '/play' : `/play/${deckSlug}`
  return `${origin}${basePath}?lang=${language}&q=${questionId}`
}
