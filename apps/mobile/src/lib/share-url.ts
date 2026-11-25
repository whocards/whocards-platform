import {DEFAULT_DECK_SLUG} from '@whocards/decks'

import {env} from '@/env'

/**
 * Build a shareable web URL for a specific question in a deck.
 *
 * Mirrors the website's `getCurrentQuestionUrl` logic (`apps/website/src/utils/urls.ts`):
 * - The default deck (`library`) lives at `/play` — no deck path segment.
 * - Every other deck lives at `/play/<deckSlug>`.
 * - Language and question ID are always passed as query params, then the share UTM.
 *
 * Examples:
 *   buildShareUrl('library', 'en', 'q-42')    → 'https://whocards.cc/play?lang=en&q=q-42&utm_source=share&utm_medium=app'
 *   buildShareUrl('ai-at-work', 'es', 'q-7')  → 'https://whocards.cc/play/ai-at-work?lang=es&q=q-7&utm_source=share&utm_medium=app'
 */
export const buildShareUrl = (deckSlug: string, language: string, questionId: string): string => {
  const basePath = deckSlug === DEFAULT_DECK_SLUG ? '/play' : `/play/${deckSlug}`
  return `${env.EXPO_PUBLIC_WEB_URL}${basePath}?lang=${language}&q=${questionId}&utm_source=share&utm_medium=app`
}

/** The most characters of a sender's name an ask link carries (issue #434). */
export const ASKER_NAME_MAX = 40

/** A sender's name as an ask link may carry it: no control characters, whitespace collapsed, capped. */
export const cleanAskerName = (name: string): string =>
  Array.from(name.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, ASKER_NAME_MAX)
    .join('')
    .trim()

/** A share link turned into an ask (issue #434): the web landing frames it as "<name> wants to hear your answer". */
export const buildAskUrl = (shareUrl: string, name: string): string => {
  const from = cleanAskerName(name)
  return `${shareUrl}&ask=1${from ? `&from=${encodeURIComponent(from)}` : ''}`
}

/** The message an ask goes out with; the OS share sheet adds nothing else. */
export const buildAskMessage = (questionText: string, askUrl: string): string =>
  `I want to hear your answer to this one:\n\n“${questionText}”\n\n${askUrl}`

/** The two Share Card sizes the on-demand endpoint renders (ADR-0007). */
export type ShareCardSize = 'story' | 'post'

/**
 * Build the on-demand Share Card image URL for a specific question (issue #153,
 * PR #157): `GET {WEB_URL}/share-card/{size}/{language}/{id}.png`.
 *
 * Mirrors the endpoint's own URL shape exactly — `size` is `story` (1080×1920)
 * or `post` (1080×1350); the server 404s for an unknown id/language/size, which
 * the caller surfaces as a download failure.
 *
 * Examples:
 *   buildShareCardUrl('story', 'en', 'q-42') → 'https://whocards.cc/share-card/story/en/q-42.png'
 *   buildShareCardUrl('post', 'es', 'q-7')   → 'https://whocards.cc/share-card/post/es/q-7.png'
 */
export const buildShareCardUrl = (
  size: ShareCardSize,
  language: string,
  questionId: string
): string => `${env.EXPO_PUBLIC_WEB_URL}/share-card/${size}/${language}/${questionId}.png`
