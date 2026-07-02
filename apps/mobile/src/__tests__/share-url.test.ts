/**
 * Tests for src/lib/share-url.ts
 *
 * Verifies that buildShareUrl produces the correct deep-link URL for both the
 * default deck (served at /play) and non-default decks (served at /play/<slug>),
 * matching the URL shape the website's getCurrentQuestionUrl emits.
 */

// Stub the env module so the test is hermetic and not tied to the default
// EXPO_PUBLIC_WEB_URL value baked into src/env.ts.
jest.mock('@/env', () => ({env: {EXPO_PUBLIC_WEB_URL: 'https://whocards.cc'}}))

// DEFAULT_DECK_SLUG is 'library' — imported from the real package so the test
// stays in sync if the default ever changes.
import {DEFAULT_DECK_SLUG} from '@whocards/decks'
import {buildShareCardUrl, buildShareUrl} from '../lib/share-url'

describe('buildShareUrl', () => {
  it('uses /play (no slug segment) for the default deck', () => {
    const url = buildShareUrl(DEFAULT_DECK_SLUG, 'en', 'q-42')
    expect(url).toBe('https://whocards.cc/play?lang=en&q=q-42')
  })

  it('includes the deck slug in the path for non-default decks', () => {
    const url = buildShareUrl('ai-at-work', 'es', 'q-7')
    expect(url).toBe('https://whocards.cc/play/ai-at-work?lang=es&q=q-7')
  })

  it('passes the language param correctly', () => {
    const url = buildShareUrl(DEFAULT_DECK_SLUG, 'he', 'q-1')
    expect(url).toContain('lang=he')
  })

  it('passes the question id param correctly', () => {
    const url = buildShareUrl('hajnalig', 'en', 'abc-123')
    expect(url).toContain('q=abc-123')
  })

  it('matches the expected URL shape end-to-end for a named deck', () => {
    const url = buildShareUrl('hajnalig', 'fr', 'q-99')
    expect(url).toBe('https://whocards.cc/play/hajnalig?lang=fr&q=q-99')
  })
})

/**
 * Tests for buildShareCardUrl — mirrors the on-demand Share Card endpoint's own
 * URL shape (apps/website/src/pages/share-card/[size]/[language]/[id].png.ts,
 * merged in PR #157): `/share-card/{size}/{language}/{id}.png`.
 */
describe('buildShareCardUrl', () => {
  it('builds the story (9:16) Share Card URL', () => {
    const url = buildShareCardUrl('story', 'en', 'q-42')
    expect(url).toBe('https://whocards.cc/share-card/story/en/q-42.png')
  })

  it('builds the post (4:5) Share Card URL', () => {
    const url = buildShareCardUrl('post', 'es', 'q-7')
    expect(url).toBe('https://whocards.cc/share-card/post/es/q-7.png')
  })

  it('has no deck-slug segment — the endpoint identifies a card by (size, language, id) alone', () => {
    const url = buildShareCardUrl('story', 'fr', 'q-99')
    expect(url).toBe('https://whocards.cc/share-card/story/fr/q-99.png')
  })
})
