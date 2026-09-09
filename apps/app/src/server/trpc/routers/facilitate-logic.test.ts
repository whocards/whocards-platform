import {describe, expect, it} from 'vitest'

import {
  buildSessionQueue,
  DOSE_META,
  DOSES,
  doseQuestionCount,
  estimatedMinutes,
  isDose,
  QUESTION_TIMER_SECONDS,
  TIMER_WARM_SECONDS,
} from './facilitate-logic'

describe('DOSES', () => {
  it('is the three doses, thin to deep', () => {
    expect(DOSES).toEqual(['micro', 'macro', 'full'])
  })
})

describe('isDose', () => {
  it('accepts each known dose', () => {
    for (const dose of DOSES) expect(isDose(dose)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isDose('medium')).toBe(false)
    expect(isDose('')).toBe(false)
    expect(isDose('Micro')).toBe(false) // case-sensitive
  })
})

describe('DOSE_META', () => {
  it('has label/tag/description for every dose', () => {
    for (const dose of DOSES) {
      expect(DOSE_META[dose].label).toBeTruthy()
      expect(DOSE_META[dose].tag).toBeTruthy()
      expect(DOSE_META[dose].description).toBeTruthy()
    }
  })
})

describe('doseQuestionCount', () => {
  it('is 0 for an empty roster, whatever the dose', () => {
    for (const dose of DOSES) expect(doseQuestionCount(0, dose)).toBe(0)
  })

  it('matches the spec formula on a deck the size of ai-at-work (37)', () => {
    // micro = max(3, ceil(37/3)) = max(3, 13) = 13
    // macro = ceil(2*37/3) = ceil(24.67) = 25
    // full = 37
    expect(doseQuestionCount(37, 'micro')).toBe(13)
    expect(doseQuestionCount(37, 'macro')).toBe(25)
    expect(doseQuestionCount(37, 'full')).toBe(37)
  })

  it('matches the spec formula on a round number of 9', () => {
    // micro = max(3, ceil(9/3)) = 3, macro = ceil(18/3) = 6, full = 9
    expect(doseQuestionCount(9, 'micro')).toBe(3)
    expect(doseQuestionCount(9, 'macro')).toBe(6)
    expect(doseQuestionCount(9, 'full')).toBe(9)
  })

  it('never asks for more than the roster has, even for a tiny custom deck', () => {
    expect(doseQuestionCount(1, 'micro')).toBe(1)
    expect(doseQuestionCount(1, 'macro')).toBe(1)
    expect(doseQuestionCount(1, 'full')).toBe(1)
    expect(doseQuestionCount(2, 'micro')).toBe(2)
    expect(doseQuestionCount(2, 'macro')).toBe(2)
    expect(doseQuestionCount(2, 'full')).toBe(2)
  })

  it('keeps macro at least as big as micro on the exact edge case (total=3)', () => {
    // micro's max(3, …) floor equals `total` here, but the raw macro formula
    // (ceil(2*3/3) = 2) would undercut it without the floor-at-micro guard.
    expect(doseQuestionCount(3, 'micro')).toBe(3)
    expect(doseQuestionCount(3, 'macro')).toBe(3)
    expect(doseQuestionCount(3, 'full')).toBe(3)
  })

  it('is non-decreasing (micro <= macro <= full) across a range of roster sizes', () => {
    for (let total = 0; total <= 50; total++) {
      const micro = doseQuestionCount(total, 'micro')
      const macro = doseQuestionCount(total, 'macro')
      const full = doseQuestionCount(total, 'full')
      expect(micro).toBeLessThanOrEqual(macro)
      expect(macro).toBeLessThanOrEqual(full)
      expect(full).toBe(total)
    }
  })

  it('never exceeds the roster size across a range of roster sizes', () => {
    for (let total = 0; total <= 50; total++) {
      for (const dose of DOSES) expect(doseQuestionCount(total, dose)).toBeLessThanOrEqual(total)
    }
  })
})

describe('buildSessionQueue', () => {
  const roster = Array.from({length: 9}, (_, i) => ({id: `q${i + 1}`}))

  it('slices the roster to the dose count, preserving order', () => {
    expect(buildSessionQueue(roster, 'micro')).toEqual(roster.slice(0, 3))
    expect(buildSessionQueue(roster, 'macro')).toEqual(roster.slice(0, 6))
    expect(buildSessionQueue(roster, 'full')).toEqual(roster)
  })

  it('is empty for an empty roster', () => {
    expect(buildSessionQueue([], 'full')).toEqual([])
  })
})

describe('estimatedMinutes', () => {
  it('budgets each question at the full per-question timer', () => {
    expect(QUESTION_TIMER_SECONDS).toBe(120)
    expect(estimatedMinutes(1)).toBe(2)
    expect(estimatedMinutes(3)).toBe(6)
    expect(estimatedMinutes(0)).toBe(0)
  })
})

describe('TIMER_WARM_SECONDS', () => {
  it('is comfortably shorter than the full timer, per the "only the last ~20s" spec', () => {
    expect(TIMER_WARM_SECONDS).toBe(20)
    expect(TIMER_WARM_SECONDS).toBeLessThan(QUESTION_TIMER_SECONDS)
  })
})
