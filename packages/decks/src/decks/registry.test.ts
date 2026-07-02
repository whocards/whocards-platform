import {describe, expect, it} from 'vitest'

import {poolQuestionIds} from '../pool'
import {isPoolBacked} from '../types'
import {DEFAULT_DECK_SLUG, getAllDecks, getDeck, isDeckSlug, resolveDeck} from './registry'

describe('registry', () => {
  it('defaults to the library deck', () => {
    expect(DEFAULT_DECK_SLUG).toBe('library')
    expect(isDeckSlug('library')).toBe(true)
    expect(isDeckSlug('nope')).toBe(false)
  })

  it('resolves the library deck to the whole Pool, in pool order', () => {
    const deck = getDeck('library')
    expect(deck?.questionIds).toEqual(poolQuestionIds)
    expect(deck?.questions['1']?.en).toMatch(/interesting/i)
  })

  it('resolves an inline deck from its own questions', () => {
    const deck = getDeck('ai-at-work')
    expect(deck?.source.kind).toBe('inline')
    expect(deck?.questionIds.length).toBeGreaterThan(0)
    expect(deck?.languages).toEqual(['en'])
  })

  it('returns undefined for an unknown slug', () => {
    expect(getDeck('does-not-exist')).toBeUndefined()
  })

  it('resolves every registered deck', () => {
    const all = getAllDecks()
    expect(all.map((d) => d.slug)).toEqual(['library', 'hajnalig', 'ai-at-work'])
    for (const deck of all) {
      expect(deck.questionIds).toEqual(Object.keys(deck.questions))
    }
  })

  it('resolveDeck is pure (no mutation of the source deck)', () => {
    const before = getAllDecks().length
    expect(getAllDecks().length).toBe(before)
    expect(resolveDeck).toBeTypeOf('function')
  })

  // isPoolBacked gates any feature (e.g. the Share Card image rows, ADR-0007)
  // that resolves ids against the global Pool — an inline deck's ids either
  // don't exist there or collide with an unrelated Pool id.
  it('isPoolBacked is true for the library deck (source.kind === "library")', () => {
    const deck = getDeck('library')
    expect(deck).toBeDefined()
    expect(deck?.source.kind).toBe('library')
    expect(isPoolBacked(deck!)).toBe(true)
  })

  it('isPoolBacked is false for inline decks, even when their ids collide with Pool ids', () => {
    const aiAtWork = getDeck('ai-at-work')
    const hajnalig = getDeck('hajnalig')
    expect(aiAtWork?.source.kind).toBe('inline')
    expect(hajnalig?.source.kind).toBe('inline')
    expect(isPoolBacked(aiAtWork!)).toBe(false)
    expect(isPoolBacked(hajnalig!)).toBe(false)
  })

  it('isPoolBacked is derived from source.kind alone, not a slug allowlist', () => {
    expect(isPoolBacked({source: {kind: 'library'}})).toBe(true)
    expect(isPoolBacked({source: {kind: 'inline', questions: {}}})).toBe(false)
  })
})
