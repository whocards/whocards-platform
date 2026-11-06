import {describe, expect, it} from 'vitest'

import {questionOfTheDay} from './daily'
import {poolQuestionIds} from './index'

const dateKey = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10)

describe('questionOfTheDay', () => {
  it('gives the same date the same question, pinned so every device agrees', () => {
    expect(questionOfTheDay('2026-11-04')).toBe(questionOfTheDay('2026-11-04'))
    expect(questionOfTheDay('2026-11-04')).toBe('31')
  })

  it('picks a Pool question', () => {
    expect(poolQuestionIds).toContain(questionOfTheDay('2026-01-01'))
  })

  it('repeats no question within a cycle as long as the Pool', () => {
    const n = poolQuestionIds.length
    const firstDay = Math.ceil(Date.UTC(2026, 0, 1) / 86_400_000 / n) * n
    const picks = Array.from({length: n}, (_, i) => questionOfTheDay(dateKey(firstDay + i)))
    expect(new Set(picks).size).toBe(n)
  })

  it('rejects a key that is not YYYY-MM-DD', () => {
    expect(() => questionOfTheDay('2026-11-4')).toThrow('not a YYYY-MM-DD date')
  })
})
