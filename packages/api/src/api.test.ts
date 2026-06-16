import {describe, expect, it} from 'vitest'

import {createCaller} from './index'

const caller = createCaller({})

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
