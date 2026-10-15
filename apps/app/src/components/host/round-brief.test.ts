import {describe, expect, it} from 'vitest'

import {roundBrief, roundToBrief, spokenDuration} from './round-brief'
import type {BriefRound} from './round-brief'

const round = (over: Partial<BriefRound> = {}): BriefRound => ({
  id: 'r1',
  n: 1,
  status: 'pending',
  turnSeconds: 90,
  oddRule: 'trio',
  overtime: 'nudge',
  overtimeSeconds: 30,
  questionPlan: {mode: 'same', question: 'c:abcd'},
  ...over,
})

describe('spokenDuration', () => {
  it('reads seconds, whole minutes and mixed', () => {
    expect(spokenDuration(1)).toBe('1 second')
    expect(spokenDuration(90)).toBe('90 seconds')
    expect(spokenDuration(120)).toBe('2 minutes')
    expect(spokenDuration(150)).toBe('2 min 30 s')
  })
})

describe('roundToBrief', () => {
  it('prefers the live round, then the lowest pending one', () => {
    const done = round({id: 'a', n: 1, status: 'done'})
    const later = round({id: 'c', n: 3})
    const next = round({id: 'b', n: 2})
    expect(roundToBrief([done, later, next])?.id).toBe('b')
    expect(roundToBrief([done, round({id: 'l', n: 2, status: 'live'}), later])?.id).toBe('l')
    expect(roundToBrief([done])).toBeNull()
    expect(roundToBrief([])).toBeNull()
  })
})

describe('roundBrief', () => {
  it('describes a first same-question voice round', () => {
    expect(roundBrief(round(), {answerMode: 'voice', standby: false})).toEqual([
      'Pair up with someone.',
      'Each of you gets 90 seconds to answer.',
      'Everyone gets the same question.',
      'Speak your answer; it is saved as text for you.',
      'When time is up, you get 30 seconds more to wrap up.',
      'Odd one out joins a pair as a trio.',
    ])
  })

  it('covers later rounds, other modes, hard stops and sitting out', () => {
    const lines = roundBrief(
      round({
        n: 2,
        turnSeconds: 120,
        overtime: 'hard',
        oddRule: 'sitout',
        questionPlan: {mode: 'random', source: 'custom'},
      }),
      {answerMode: 'type', standby: false}
    )
    expect(lines).toEqual([
      'Pair with someone new.',
      'Each of you gets 2 minutes to answer.',
      'Each of you draws your own question on your phone.',
      'Type your answer on your phone.',
      'When time is up, the turn ends.',
      'Odd one out sits this round out.',
    ])
  })

  it('treats a zero grace period as a hard stop', () => {
    expect(roundBrief(round({overtimeSeconds: 0}), {answerMode: 'none', standby: false})).toContain(
      'When time is up, the turn ends.'
    )
  })

  it('sends the odd one out to a facilitator first, falling back on the round rule', () => {
    const lines = roundBrief(round({oddRule: 'sitout'}), {answerMode: 'none', standby: true})
    expect(lines).toContain('Odd one out: find a facilitator. If none is free, sit this round out.')
    expect(lines).toContain('Just talk. Nothing is recorded.')
    expect(roundBrief(round(), {answerMode: 'none', standby: true})).toContain(
      'Odd one out: find a facilitator. If none is free, join a pair as a trio.'
    )
  })

  it('describes physical and per-turn rounds', () => {
    const opts = {answerMode: 'voice', standby: false} as const
    expect(roundBrief(round({questionPlan: {mode: 'physical'}}), opts)).toContain(
      'Draw a card from the deck in the room and read it out.'
    )
    expect(
      roundBrief(round({questionPlan: {mode: 'per-turn', questions: ['c:aaaa', 'c:bbbb']}}), opts)
    ).toContain('Each turn has its own question, the same for every pair.')
  })
})
