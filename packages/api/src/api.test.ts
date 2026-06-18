import {describe, expect, it, vi} from 'vitest'

import {createCaller} from './index'

// the content routers are context-free; a no-op recordAnswer satisfies the port
const caller = createCaller({recordAnswer: async () => {}})

describe('decks router', () => {
  it('manifest lists every deck without question text', async () => {
    const manifest = await caller.decks.manifest()
    expect(manifest.map((d) => d.slug)).toEqual(['library', 'hajnalig', 'ai-at-work'])
    expect(manifest[0]).not.toHaveProperty('questions')
    expect(manifest[0]?.questionCount).toBe(66)
  })

  it('bySlug resolves a deck with its questions', async () => {
    const deck = await caller.decks.bySlug({slug: 'library'})
    expect(deck.questionIds).toHaveLength(66)
    expect(deck.questions['1']?.en).toMatch(/interesting/i)
  })

  it('bySlug throws NOT_FOUND for an unknown slug', async () => {
    await expect(caller.decks.bySlug({slug: 'nope'})).rejects.toThrow(/Unknown deck/)
  })
})

describe('pool router', () => {
  it('returns language metadata', async () => {
    const langs = await caller.pool.languages()
    expect(langs.default).toBe('en')
    expect(langs.codes).toHaveLength(14)
    expect(langs.names.en).toBe('English')
  })
})

describe('answers router', () => {
  it('record hands a valid Answer to the recordAnswer port (type defaults to "answered")', async () => {
    const recordAnswer = vi.fn(async () => {})
    await createCaller({recordAnswer}).answers.record({
      deviceId: 'dev-1',
      deckSlug: 'library',
      questionId: '1',
      language: 'en',
    })
    expect(recordAnswer).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      deckSlug: 'library',
      questionId: '1',
      language: 'en',
      type: 'answered',
    })
  })

  it('record rejects an empty deviceId without touching the port', async () => {
    const recordAnswer = vi.fn(async () => {})
    await expect(
      createCaller({recordAnswer}).answers.record({
        deviceId: '',
        deckSlug: 'library',
        questionId: '1',
        language: 'en',
      })
    ).rejects.toThrow()
    expect(recordAnswer).not.toHaveBeenCalled()
  })
})
