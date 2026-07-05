import {describe, expect, it} from 'vitest'

import type {ResolvedDeck} from '@whocards/decks'

import {
  buildLibraryReviews,
  buildLibraryRoster,
  LIBRARY_ACT_LABEL,
  LIBRARY_DECK,
} from './bootstrap-logic'

// A tiny synthetic deck so the row-shaping logic is checked independently of
// the real 66-question library content.
const fakeDeck: ResolvedDeck = {
  slug: 'fake-deck',
  title: 'Fake Deck',
  description: 'A fake deck for tests.',
  source: {kind: 'inline', questions: {}},
  languages: ['en', 'fr'],
  questions: {
    '1': {en: 'First?', fr: 'Premier ?'},
    '2': {en: 'Second?', fr: 'Deuxième ?'},
    '3': {en: '', fr: 'Troisième ?'}, // no English text on purpose
  },
  questionIds: ['1', '2', '3'],
}

describe('LIBRARY_DECK', () => {
  it('resolves the real library deck (issue #222 classic 66-question deck)', () => {
    expect(LIBRARY_DECK.slug).toBe('library')
    expect(LIBRARY_DECK.questionIds).toHaveLength(66)
    expect(LIBRARY_DECK.questionIds[0]).toBe('1')
    expect(LIBRARY_DECK.questionIds[65]).toBe('66')
  })

  it('has non-empty English text for every question', () => {
    for (const id of LIBRARY_DECK.questionIds) {
      expect(LIBRARY_DECK.questions[id]?.en?.trim()).not.toBe('')
    }
  })
})

describe('buildLibraryRoster', () => {
  it('maps every question id to a roster row, in deck order', () => {
    expect(buildLibraryRoster(fakeDeck)).toEqual([
      {deckSlug: 'fake-deck', questionId: '1', actLabel: LIBRARY_ACT_LABEL, sortOrder: 0},
      {deckSlug: 'fake-deck', questionId: '2', actLabel: LIBRARY_ACT_LABEL, sortOrder: 1},
      {deckSlug: 'fake-deck', questionId: '3', actLabel: LIBRARY_ACT_LABEL, sortOrder: 2},
    ])
  })

  it('gives every row the same single act label (no acts/categories of its own)', () => {
    const rows = buildLibraryRoster(fakeDeck)
    expect(new Set(rows.map((r) => r.actLabel)).size).toBe(1)
  })

  it('is empty for a deck with no questions', () => {
    expect(buildLibraryRoster({...fakeDeck, questionIds: []})).toEqual([])
  })
})

describe('buildLibraryReviews', () => {
  it('seeds pre-approved rows carrying the shipped English text', () => {
    expect(buildLibraryReviews(fakeDeck)).toEqual([
      {deckSlug: 'fake-deck', questionId: '1', status: 'approved', currentText: 'First?'},
      {deckSlug: 'fake-deck', questionId: '2', status: 'approved', currentText: 'Second?'},
      {deckSlug: 'fake-deck', questionId: '3', status: 'approved', currentText: ''},
    ])
  })

  it('is empty for a deck with no questions', () => {
    expect(buildLibraryReviews({...fakeDeck, questionIds: []})).toEqual([])
  })
})
