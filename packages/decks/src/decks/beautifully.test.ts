import {describe, expect, it} from 'vitest'

import {LANGUAGE_CODES} from '../pool'
import {isPoolBacked} from '../types'
import {beautifullyDeck} from './beautifully'
import {isDeckSlug, resolveDeck} from './registry'

describe('beautifully deck', () => {
  const deck = resolveDeck(beautifullyDeck)

  it('carries the original 61 questions inline', () => {
    expect(deck.source.kind).toBe('inline')
    expect(isPoolBacked(deck)).toBe(false)
    expect(deck.questionIds).toHaveLength(61)
    expect(deck.questionIds[0]).toBe('1')
    expect(deck.questions['1']?.en).toMatch(/interesting thing you have learnt/i)
  })

  it('has every declared language on every question, and only Pool-known codes', () => {
    for (const lang of deck.languages) expect(LANGUAGE_CODES).toContain(lang)
    for (const id of deck.questionIds) {
      for (const lang of deck.languages) {
        expect(deck.questions[id]?.[lang], `${id}/${lang}`).toBeTruthy()
      }
    }
  })

  it('is not registered yet (kept out of /play, the manifest and mobile)', () => {
    expect(isDeckSlug('beautifully')).toBe(false)
  })
})
