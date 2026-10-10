import {describe, expect, it} from 'vitest'

import {cacheControlFor} from './cache'

describe('cacheControlFor', () => {
  it('edge-caches successful content queries', () => {
    expect(cacheControlFor({paths: ['decks.manifest'], type: 'query', errorCount: 0})).toMatch(
      /s-maxage=3600/
    )
  })

  it('leaves errors and mutations uncached', () => {
    expect(cacheControlFor({paths: ['decks.bySlug'], type: 'query', errorCount: 1})).toBeNull()
    expect(cacheControlFor({paths: ['answers.record'], type: 'mutation', errorCount: 0})).toBeNull()
  })

  it('never caches game calls, even batched with content', () => {
    expect(cacheControlFor({paths: ['game.state'], type: 'query', errorCount: 0})).toBe('no-store')
    expect(
      cacheControlFor({paths: ['decks.manifest', 'game.screen'], type: 'query', errorCount: 0})
    ).toBe('no-store')
  })
})
