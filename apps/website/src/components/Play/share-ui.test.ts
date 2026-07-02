import {describe, expect, it} from 'vitest'

import {
  buildQuestionShareUrl,
  buildShareCardFilename,
  buildShareCardUrl,
  getImageRowLabel,
  supportsFileShare,
  supportsShareImages,
} from './share-ui'

describe('buildShareCardUrl', () => {
  it('builds the on-demand share-card endpoint url (PR #157 shape)', () => {
    expect(buildShareCardUrl('story', 'en', '1')).toBe('/share-card/story/en/1.png')
    expect(buildShareCardUrl('post', 'de', '42')).toBe('/share-card/post/de/42.png')
  })

  it('does not encode the language/id segments (they are already URL-safe codes)', () => {
    expect(buildShareCardUrl('story', 'pt-br', 'q-7')).toBe('/share-card/story/pt-br/q-7.png')
  })
})

describe('buildShareCardFilename', () => {
  it('builds a stable, self-describing filename for the shared/downloaded file', () => {
    expect(buildShareCardFilename('story', 'en', '1')).toBe('whocards-story-1-en.png')
    expect(buildShareCardFilename('post', 'he', 'q-9')).toBe('whocards-post-q-9-he.png')
  })
})

describe('supportsFileShare', () => {
  it('is false when navigator is undefined (SSR / no window)', () => {
    expect(supportsFileShare(undefined)).toBe(false)
  })

  it('is false when canShare is missing (most desktop browsers)', () => {
    expect(supportsFileShare({})).toBe(false)
  })

  it('is true when canShare accepts a file (mobile Safari/Chrome)', () => {
    expect(supportsFileShare({canShare: () => true})).toBe(true)
  })

  it('is false when canShare rejects files (share exists but text/url only)', () => {
    expect(supportsFileShare({canShare: () => false})).toBe(false)
  })

  it('is false, not throwing, when canShare itself throws', () => {
    expect(
      supportsFileShare({
        canShare: () => {
          throw new Error('nope')
        },
      })
    ).toBe(false)
  })

  it('probes with a real File so browsers validating the ShareData shape see one', () => {
    let seen: ShareData | undefined
    supportsFileShare({
      canShare: (data) => {
        seen = data
        return true
      },
    })
    expect(seen?.files).toHaveLength(1)
    expect(seen?.files?.[0]).toBeInstanceOf(File)
    expect(seen?.files?.[0]?.type).toBe('image/png')
  })
})

describe('getImageRowLabel', () => {
  it('labels the row as a share when file-share is supported', () => {
    expect(getImageRowLabel('story', true)).toBe('Story image')
    expect(getImageRowLabel('post', true)).toBe('Post image')
  })

  it('labels the row as a download when file-share is unsupported (desktop)', () => {
    expect(getImageRowLabel('story', false)).toBe('Download story image')
    expect(getImageRowLabel('post', false)).toBe('Download post image')
  })
})

describe('supportsShareImages', () => {
  it('is true for a Pool-backed deck (source.kind === "library"), e.g. the library deck', () => {
    expect(supportsShareImages({kind: 'library'})).toBe(true)
    expect(supportsShareImages({kind: 'library', ids: ['1', '2']})).toBe(true)
  })

  it('is false for a deck carrying its own inline questions, e.g. ai-at-work', () => {
    expect(supportsShareImages({kind: 'inline', questions: {'ai-3': {en: 'text'}}})).toBe(false)
  })

  it('is false for an inline deck even when its ids collide with real Pool ids', () => {
    // hajnalig's inline questions are numbered 1-163, overlapping the Pool's 1-66.
    // The gate must key off source.kind, never the id shape — otherwise a hajnalig
    // share would silently render the Pool's unrelated question with the same id.
    expect(
      supportsShareImages({
        kind: 'inline',
        questions: {'1': {hu: 'szia'}, '66': {hu: 'msg'}, '140': {hu: 'msg2'}},
      })
    ).toBe(false)
  })
})

describe('buildQuestionShareUrl', () => {
  it('uses /play (no slug segment) for the default deck', () => {
    expect(buildQuestionShareUrl('https://whocards.cc', 'library', 'en', 'q-42')).toBe(
      'https://whocards.cc/play?lang=en&q=q-42'
    )
  })

  it('includes the deck slug in the path for non-default decks (mirrors mobile buildShareUrl)', () => {
    expect(buildQuestionShareUrl('https://whocards.cc', 'ai-at-work', 'es', 'q-7')).toBe(
      'https://whocards.cc/play/ai-at-work?lang=es&q=q-7'
    )
  })

  it('builds a deck-aware link for the colliding-numeric-id hajnalig case', () => {
    // Without the deck segment, q=1 would resolve inside the library deck to an
    // unrelated Pool question instead of hajnalig's question 1.
    expect(buildQuestionShareUrl('https://whocards.cc', 'hajnalig', 'hu', '1')).toBe(
      'https://whocards.cc/play/hajnalig?lang=hu&q=1'
    )
  })

  it('uses the given origin verbatim', () => {
    expect(buildQuestionShareUrl('http://localhost:4321', 'library', 'en', '1')).toBe(
      'http://localhost:4321/play?lang=en&q=1'
    )
  })
})
