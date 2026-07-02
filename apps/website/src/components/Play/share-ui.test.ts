import {describe, expect, it} from 'vitest'

import {
  buildShareCardFilename,
  buildShareCardUrl,
  getImageRowLabel,
  supportsFileShare,
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
