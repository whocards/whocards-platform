import {describe, expect, it} from 'vitest'

import {
  buildNewQuestion,
  canTransitionDeckStatus,
  DECK_STATUSES,
  DECKS_MIN_ROLE,
  groupByAct,
  isDeckStatus,
  nextStatusOptions,
} from './decks-logic'
import type {DeckStatus} from './decks-logic'

describe('DECK_STATUSES', () => {
  it('is the 4-stage pipeline, in order', () => {
    expect(DECK_STATUSES).toEqual(['draft', 'in_review', 'approved', 'shipped'])
  })
})

describe('isDeckStatus', () => {
  it('accepts each known status', () => {
    for (const status of DECK_STATUSES) expect(isDeckStatus(status)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isDeckStatus('published')).toBe(false)
    expect(isDeckStatus('')).toBe(false)
    expect(isDeckStatus('Draft')).toBe(false) // case-sensitive
  })
})

describe('canTransitionDeckStatus', () => {
  it('allows the no-op (same status)', () => {
    for (const status of DECK_STATUSES) expect(canTransitionDeckStatus(status, status)).toBe(true)
  })

  it('allows moving one step forward', () => {
    expect(canTransitionDeckStatus('draft', 'in_review')).toBe(true)
    expect(canTransitionDeckStatus('in_review', 'approved')).toBe(true)
    expect(canTransitionDeckStatus('approved', 'shipped')).toBe(true)
  })

  it('allows moving one step back (reopen)', () => {
    expect(canTransitionDeckStatus('in_review', 'draft')).toBe(true)
    expect(canTransitionDeckStatus('approved', 'in_review')).toBe(true)
    expect(canTransitionDeckStatus('shipped', 'approved')).toBe(true)
  })

  it('blocks skipping steps forward', () => {
    expect(canTransitionDeckStatus('draft', 'approved')).toBe(false)
    expect(canTransitionDeckStatus('draft', 'shipped')).toBe(false)
    expect(canTransitionDeckStatus('in_review', 'shipped')).toBe(false)
  })

  it('blocks skipping steps backward', () => {
    expect(canTransitionDeckStatus('shipped', 'draft')).toBe(false)
    expect(canTransitionDeckStatus('shipped', 'in_review')).toBe(false)
    expect(canTransitionDeckStatus('approved', 'draft')).toBe(false)
  })
})

describe('nextStatusOptions', () => {
  it('includes the current status plus its adjacent steps only', () => {
    expect(nextStatusOptions('draft')).toEqual(['draft', 'in_review'])
    expect(nextStatusOptions('in_review')).toEqual(['draft', 'in_review', 'approved'])
    expect(nextStatusOptions('approved')).toEqual(['in_review', 'approved', 'shipped'])
    expect(nextStatusOptions('shipped')).toEqual(['approved', 'shipped'])
  })

  it('never includes a status canTransitionDeckStatus would reject', () => {
    for (const current of DECK_STATUSES) {
      for (const option of nextStatusOptions(current)) {
        expect(canTransitionDeckStatus(current, option)).toBe(true)
      }
    }
  })

  it('always includes the current status itself (so the select has a match)', () => {
    for (const current of DECK_STATUSES) {
      expect(nextStatusOptions(current)).toContain(current)
    }
  })
})

describe('groupByAct', () => {
  it('groups items under their act label, preserving first-seen order', () => {
    const items = [
      {actLabel: 'Act 1', id: 'a'},
      {actLabel: 'Act 2', id: 'b'},
      {actLabel: 'Act 1', id: 'c'},
    ]
    expect(groupByAct(items)).toEqual([
      {actLabel: 'Act 1', items: [items[0], items[2]]},
      {actLabel: 'Act 2', items: [items[1]]},
    ])
  })

  it('is empty for an empty list', () => {
    expect(groupByAct([])).toEqual([])
  })

  it('returns one group when every item shares an act label', () => {
    const items = [
      {actLabel: 'Only act', id: 'a'},
      {actLabel: 'Only act', id: 'b'},
    ]
    expect(groupByAct(items)).toEqual([{actLabel: 'Only act', items}])
  })
})

describe('DECKS_MIN_ROLE', () => {
  it('matches the founder brief: reviewer views, facilitator manages', () => {
    expect(DECKS_MIN_ROLE.view).toBe('reviewer')
    expect(DECKS_MIN_ROLE.updateStatus).toBe('facilitator')
    expect(DECKS_MIN_ROLE.addQuestion).toBe('facilitator')
  })
})

const generateId = () => 'fixed-id'

describe('buildNewQuestion', () => {
  it('shapes the deckQuestion + questionReview rows from trimmed input', () => {
    const record = buildNewQuestion(
      {deckSlug: 'ai-at-work', actLabel: 'Act 2 — Map the work', text: '  What changed?  '},
      generateId,
      3
    )
    expect(record).toEqual({
      questionId: 'ai-at-work-fixed-id',
      deckQuestion: {
        deckSlug: 'ai-at-work',
        questionId: 'ai-at-work-fixed-id',
        actLabel: 'Act 2 — Map the work',
        sortOrder: 3,
      },
      questionReview: {
        deckSlug: 'ai-at-work',
        questionId: 'ai-at-work-fixed-id',
        status: 'draft',
        currentText: 'What changed?',
      },
    })
  })

  it('rejects a blank question text', () => {
    expect(() =>
      buildNewQuestion({deckSlug: 'd', actLabel: 'a', text: '   '}, generateId, 0)
    ).toThrow('text is required')
  })

  it('rejects a blank act label', () => {
    expect(() =>
      buildNewQuestion({deckSlug: 'd', actLabel: '  ', text: 't'}, generateId, 0)
    ).toThrow('actLabel is required')
  })

  it('rejects a blank deck slug', () => {
    expect(() =>
      buildNewQuestion({deckSlug: ' ', actLabel: 'a', text: 't'}, generateId, 0)
    ).toThrow('deckSlug is required')
  })
})

describe('type export sanity', () => {
  it('DeckStatus values line up with DECK_STATUSES', () => {
    const sample: DeckStatus = 'in_review'
    expect(DECK_STATUSES).toContain(sample)
  })
})
