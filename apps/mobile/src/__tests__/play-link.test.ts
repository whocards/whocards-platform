/**
 * Tests for src/lib/play-link.ts
 *
 * `parsePlayLink` turns an incoming deep link into `{deck, q?, lang?}` (or `null`).
 * It backs the warm-deep-link listener in `play/[deck]`, which re-seeds the engine
 * when a link targets the already-open deck — the path expo-router won't route
 * because it de-dupes same-route links. Covers both link schemes, the slug-less
 * default-deck case, the query, and the non-play rejections.
 */

import {DEFAULT_DECK_SLUG} from '@whocards/decks'
import {parsePlayLink} from '../lib/play-link'

describe('parsePlayLink', () => {
  it('parses an explicit deck with q + lang (custom scheme)', () => {
    expect(parsePlayLink('mobile://play/library?q=5&lang=en')).toEqual({
      deck: 'library',
      q: '5',
      lang: 'en',
    })
  })

  it('parses an explicit deck (universal link)', () => {
    expect(parsePlayLink('https://whocards.cc/play/ai-at-work?q=3')).toEqual({
      deck: 'ai-at-work',
      q: '3',
      lang: undefined,
    })
  })

  it('maps the slug-less /play to the default deck, preserving the query', () => {
    expect(parsePlayLink('https://whocards.cc/play?q=7&lang=he')).toEqual({
      deck: DEFAULT_DECK_SLUG,
      q: '7',
      lang: 'he',
    })
  })

  it('maps the slug-less custom scheme mobile://play to the default deck', () => {
    expect(parsePlayLink('mobile://play?q=1')).toEqual({
      deck: DEFAULT_DECK_SLUG,
      q: '1',
      lang: undefined,
    })
  })

  it('handles an explicit deck with no query', () => {
    expect(parsePlayLink('mobile://play/library')).toEqual({
      deck: 'library',
      q: undefined,
      lang: undefined,
    })
  })

  it('tolerates a trailing slash on /play', () => {
    expect(parsePlayLink('https://whocards.cc/play/')).toEqual({
      deck: DEFAULT_DECK_SLUG,
      q: undefined,
      lang: undefined,
    })
  })

  it('returns null for a non-play path', () => {
    expect(parsePlayLink('https://whocards.cc/about')).toBeNull()
    expect(parsePlayLink('https://whocards.cc/playground')).toBeNull()
  })

  it('returns null for a nested play path (not a deck route)', () => {
    expect(parsePlayLink('https://whocards.cc/play/library/extra')).toBeNull()
  })
})
