import {describe, expect, it} from 'vitest'
import {clockOffset, msUntil, turnClock, turnDeadline} from './timer'

const timing = {startedAt: 1000, turnSeconds: 60, overtime: 'nudge', overtimeSeconds: 30} as const

describe('turnDeadline', () => {
  it('adds the nudge grace only for nudge', () => {
    expect(turnDeadline(timing)).toBe(91_000)
    expect(turnDeadline({...timing, overtime: 'hard'})).toBe(61_000)
  })
})

describe('turnClock', () => {
  it('moves talking → overtime → over under nudge', () => {
    expect(turnClock(timing, 31_000)).toEqual({
      phase: 'talking',
      remainingMs: 30_000,
      untilDeadlineMs: 60_000,
    })
    expect(turnClock(timing, 61_000)).toEqual({
      phase: 'overtime',
      remainingMs: 0,
      untilDeadlineMs: 30_000,
    })
    expect(turnClock(timing, 95_000).phase).toBe('over')
  })

  it('skips overtime when hard', () => {
    expect(turnClock({...timing, overtime: 'hard'}, 61_000).phase).toBe('over')
  })
})

describe('clockOffset', () => {
  it('assumes the server stamped the reply mid round trip', () => {
    expect(clockOffset({serverNow: 10_150, sentAt: 100, receivedAt: 200})).toBe(10_000)
  })
})

describe('msUntil', () => {
  it('clamps at zero and passes null through', () => {
    expect(msUntil(500, 200)).toBe(300)
    expect(msUntil(100, 200)).toBe(0)
    expect(msUntil(null, 200)).toBeNull()
  })
})
