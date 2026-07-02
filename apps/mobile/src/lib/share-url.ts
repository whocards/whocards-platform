import {DEFAULT_DECK_SLUG} from '@whocards/decks'

import {env} from '@/env'

/**
 * Build a shareable web URL for a specific question in a deck.
 *
 * Mirrors the website's `getCurrentQuestionUrl` logic (`apps/website/src/utils/urls.ts`):
 * - The default deck (`library`) lives at `/play` — no deck path segment.
 * - Every other deck lives at `/play/<deckSlug>`.
 * - Language and question ID are always passed as query params.
 *
 * Examples:
 *   buildShareUrl('library', 'en', 'q-42')    → 'https://whocards.cc/play?lang=en&q=q-42'
 *   buildShareUrl('ai-at-work', 'es', 'q-7')  → 'https://whocards.cc/play/ai-at-work?lang=es&q=q-7'
 */
export const buildShareUrl = (deckSlug: string, language: string, questionId: string): string => {
  const basePath = deckSlug === DEFAULT_DECK_SLUG ? '/play' : `/play/${deckSlug}`
  return `${env.EXPO_PUBLIC_WEB_URL}${basePath}?lang=${language}&q=${questionId}`
}

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
