import {describe, expect, it} from 'vitest'

import {
  actLabelFor,
  assembleDeck,
  QUESTION_IDS,
  tallyVotesForQuestion,
} from './question-review-logic'

describe('QUESTION_IDS', () => {
  it('is exactly ai-1..ai-37, in order', () => {
    expect(QUESTION_IDS).toHaveLength(37)
    expect(QUESTION_IDS[0]).toBe('ai-1')
    expect(QUESTION_IDS[36]).toBe('ai-37')
  })
})

describe('actLabelFor', () => {
  it('maps each act boundary to the right label', () => {
    expect(actLabelFor('ai-1')).toBe('Act 1 — Name the fear')
    expect(actLabelFor('ai-9')).toBe('Act 1 — Name the fear')
    expect(actLabelFor('ai-10')).toBe('Act 2 — Map the work')
    expect(actLabelFor('ai-18')).toBe('Act 2 — Map the work')
    expect(actLabelFor('ai-19')).toBe('Act 3 — Redesign the role')
    expect(actLabelFor('ai-27')).toBe('Act 3 — Redesign the role')
    expect(actLabelFor('ai-28')).toBe('Act 4 — Team norms')
    expect(actLabelFor('ai-37')).toBe('Act 4 — Team norms')
  })

  it('returns an empty string for an out-of-range id', () => {
    expect(actLabelFor('ai-38')).toBe('')
    expect(actLabelFor('ai-0')).toBe('')
  })
})

describe('tallyVotesForQuestion', () => {
  const votes = [
    {questionId: 'ai-1', variant: 'ai-at-work-human'},
    {questionId: 'ai-1', variant: 'ai-at-work-human'},
    {questionId: 'ai-1', variant: 'ai-at-work-open'},
    {questionId: 'ai-2', variant: 'ai-at-work-stories'},
  ]

  it('counts only votes for the given question', () => {
    expect(tallyVotesForQuestion(votes, 'ai-1')).toEqual({
      'ai-at-work-human': 2,
      'ai-at-work-open': 1,
    })
  })

  it('is empty for a question with no votes', () => {
    expect(tallyVotesForQuestion(votes, 'ai-99')).toEqual({})
  })

  it('is empty for an empty vote list', () => {
    expect(tallyVotesForQuestion([], 'ai-1')).toEqual({})
  })
})

const shippedText = (questionId: string) => `shipped:${questionId}`

describe('assembleDeck', () => {
  it('falls back to the shipped baseline when nothing is approved', () => {
    const deck = assembleDeck(shippedText, new Map(), ['ai-1', 'ai-2'])
    expect(deck).toEqual({
      'ai-1': {en: 'shipped:ai-1'},
      'ai-2': {en: 'shipped:ai-2'},
    })
  })

  it('uses the approved text where a question has been decided', () => {
    const approved = new Map([['ai-1', 'approved text for ai-1']])
    const deck = assembleDeck(shippedText, approved, ['ai-1', 'ai-2'])
    expect(deck).toEqual({
      'ai-1': {en: 'approved text for ai-1'},
      'ai-2': {en: 'shipped:ai-2'},
    })
  })

  it('covers every requested question id, approved or not', () => {
    const deck = assembleDeck(shippedText, new Map(), QUESTION_IDS)
    expect(Object.keys(deck)).toHaveLength(37)
  })
})
