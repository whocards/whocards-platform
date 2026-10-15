import {describe, expect, it} from 'vitest'
import {round, snapshot, turn} from '../fixtures.test-utils'
import {PHYSICAL_QUESTION_ID, PHYSICAL_SOURCE, questionPlanSchema} from '../schemas'
import type {QuestionPlan} from '../schemas'
import {
  checkPlan,
  planDeckSlug,
  planOf,
  questionForTurn,
  questionText,
  refOf,
  samePlan,
  usedRefs,
} from './questions'
import type {QuestionSources} from './questions'

const decks: QuestionSources['decks'] = (slug) =>
  slug === 'library'
    ? {questionIds: ['1', '2'], questions: {'1': {en: 'One?', hu: 'Egy?'}, '2': {en: 'Two?'}}}
    : undefined

const sources: QuestionSources = {
  custom: [
    {id: 'c:aaaa', en: 'Custom A?', hu: 'Saját A?'},
    {id: 'c:bbbb', en: 'Custom B?'},
  ],
  decks,
}

const next = (plan: QuestionPlan, turnIndex: number, used = new Set<string>()) =>
  questionForTurn({plan, turnIndex, used, random: () => 0, sources})

describe('questionForTurn', () => {
  it('draws an unused question from a deck or the custom list', () => {
    expect(next({mode: 'random', source: 'library'}, 0)).toBe('library:1')
    expect(next({mode: 'random', source: 'library'}, 0, new Set(['library:1']))).toBe('library:2')
    expect(next({mode: 'random', source: 'custom'}, 1, new Set(['c:aaaa']))).toBe('c:bbbb')
    expect(next({mode: 'random', source: 'nope'}, 0)).toBeNull()
  })

  it('gives everyone the same question', () => {
    const plan: QuestionPlan = {mode: 'same', question: 'c:aaaa'}
    expect([0, 1, 2].map((i) => next(plan, i, new Set(['c:aaaa'])))).toEqual([
      'c:aaaa',
      'c:aaaa',
      'c:aaaa',
    ])
  })

  it('alternates per turn, and a trio third turn reuses the first question', () => {
    const plan: QuestionPlan = {mode: 'per-turn', questions: ['c:aaaa', 'library:2']}
    expect([0, 1, 2].map((i) => next(plan, i))).toEqual(['c:aaaa', 'library:2', 'c:aaaa'])
  })
})

describe('questionText', () => {
  it('resolves custom and deck refs in the player language, falling back to English', () => {
    expect(questionText('c:aaaa', 'hu', sources)).toBe('Saját A?')
    expect(questionText('c:bbbb', 'hu', sources)).toBe('Custom B?')
    expect(questionText('library:1', 'hu', sources)).toBe('Egy?')
    expect(questionText('library:2', 'hu', sources)).toBe('Two?')
  })

  it('returns null for refs that point nowhere', () => {
    expect(questionText('c:gone', 'en', sources)).toBeNull()
    expect(questionText('library:99', 'en', sources)).toBeNull()
    expect(questionText('nope:1', 'en', sources)).toBeNull()
    expect(questionText('1', 'en', sources)).toBeNull()
  })

  it('reads bare ids on pre-plan turns against their round deck', () => {
    expect(questionText(refOf('1', 'library'), 'en', sources)).toBe('One?')
    expect(refOf('c:aaaa', 'library')).toBe('c:aaaa')
  })
})

describe('usedRefs', () => {
  it('normalises bare ids with the turn round deck', () => {
    const s = snapshot({
      turns: [
        turn({id: 't1', pairId: 'p1', playerId: 'a', questionId: '2'}),
        turn({id: 't2', pairId: 'p1', playerId: 'a', questionId: 'c:aaaa'}),
        turn({id: 't3', pairId: 'p1', playerId: 'b', questionId: '1'}),
      ],
    })
    expect(usedRefs(s, 'a')).toEqual(new Set(['library:2', 'c:aaaa']))
  })
})

describe('plans', () => {
  it('treats a round without a plan as random from its deck', () => {
    expect(planOf(round({deckSlug: 'hajnalig'}))).toEqual({mode: 'random', source: 'hajnalig'})
  })

  it('records the random source or the first pick source as deck_slug', () => {
    expect(planDeckSlug({mode: 'random', source: 'custom'})).toBe('custom')
    expect(planDeckSlug({mode: 'same', question: 'library:1'})).toBe('library')
    expect(planDeckSlug({mode: 'per-turn', questions: ['c:aaaa', 'library:1']})).toBe('custom')
  })

  it('compares plans by meaning, not key order', () => {
    expect(samePlan({mode: 'random', source: 'library'}, {source: 'library', mode: 'random'})).toBe(
      true
    )
    expect(samePlan({mode: 'random', source: 'library'}, {mode: 'random', source: 'custom'})).toBe(
      false
    )
    expect(samePlan({mode: 'same', question: 'c:aaaa'}, {mode: 'same', question: 'c:aaaa'})).toBe(
      true
    )
    expect(
      samePlan(
        {mode: 'same', question: 'c:aaaa'},
        {mode: 'per-turn', questions: ['c:aaaa', 'c:aaaa']}
      )
    ).toBe(false)
  })

  it('requires the picks a mode needs, as source-qualified refs', () => {
    for (const plan of [
      {mode: 'same'},
      {mode: 'same', question: '12'},
      {mode: 'per-turn', questions: ['library:1']},
      {mode: 'shuffle', source: 'library'},
    ]) {
      expect(questionPlanSchema.safeParse(plan).success).toBe(false)
    }
    expect(questionPlanSchema.safeParse({mode: 'same', question: 'ai-at-work:ai-1'}).success).toBe(
      true
    )
  })

  it('flags unknown sources, unknown questions and empty sources', () => {
    expect(checkPlan({mode: 'random', source: 'library'}, sources)).toBeNull()
    expect(checkPlan({mode: 'random', source: 'nope'}, sources)).toBe('unknown_source')
    expect(checkPlan({mode: 'random', source: 'custom'}, {custom: [], decks})).toBe('no_questions')
    expect(checkPlan({mode: 'same', question: 'c:gone'}, sources)).toBe('unknown_question')
    expect(checkPlan({mode: 'per-turn', questions: ['c:aaaa', 'library:2']}, sources)).toBeNull()
    expect(checkPlan({mode: 'per-turn', questions: ['c:aaaa', 'library:9']}, sources)).toBe(
      'unknown_question'
    )
  })
})

describe('physical cards', () => {
  const physical: QuestionPlan = {mode: 'physical'}

  it('hands every turn the sentinel, which has no text and names no deck', () => {
    for (const turnIndex of [0, 1, 2]) {
      expect(
        questionForTurn({plan: physical, turnIndex, used: new Set(), random: () => 0, sources})
      ).toBe(PHYSICAL_QUESTION_ID)
    }
    expect(questionText(PHYSICAL_QUESTION_ID, 'en', sources)).toBeNull()
    expect(checkPlan(physical, {custom: [], decks})).toBeNull()
    expect(planDeckSlug(physical)).toBe(PHYSICAL_SOURCE)
    expect(samePlan(physical, {mode: 'physical'})).toBe(true)
    expect(samePlan(physical, {mode: 'random', source: 'library'})).toBe(false)
  })

  it('keeps the sentinel out of the used refs', () => {
    const s = snapshot({
      turns: [
        turn({id: 't1', pairId: 'p1', playerId: 'a', questionId: PHYSICAL_QUESTION_ID}),
        turn({id: 't2', pairId: 'p1', playerId: 'a', questionId: 'library:1'}),
      ],
    })
    expect(usedRefs(s, 'a')).toEqual(new Set(['library:1']))
  })
})
