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
