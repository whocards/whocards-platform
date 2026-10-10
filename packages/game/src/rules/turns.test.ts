import {describe, expect, it} from 'vitest'
import {pair, round, snapshot, turn} from '../fixtures.test-utils'
import {checkClaim, checkFinish, drawQuestion, phaseOf} from './turns'

const p = pair('p1', ['a', 'b'])

describe('checkClaim', () => {
  it('lets the first claimant start', () => {
    expect(checkClaim(round(), p, [], 'a', 1000)).toEqual({ok: true, start: true, expire: []})
  })

  it('locks the partner out while a turn is open', () => {
    const turns = [turn({id: 't1', pairId: 'p1', playerId: 'a', startedAt: 1000})]
    expect(checkClaim(round(), p, turns, 'b', 2000)).toEqual({
      ok: false,
      reason: 'partner_answering',
    })
    expect(checkClaim(round(), p, turns, 'a', 2000)).toEqual({ok: true, start: false, expire: []})
  })

  it('unlocks once the open turn passes its deadline and expires it at the deadline', () => {
    const turns = [turn({id: 't1', pairId: 'p1', playerId: 'a', startedAt: 0})]
    expect(checkClaim(round(), p, turns, 'b', 89_999).ok).toBe(false)
    expect(checkClaim(round(), p, turns, 'b', 90_000)).toEqual({
      ok: true,
      start: true,
      expire: [{turnId: 't1', finishedAt: 90_000}],
    })
  })

  it('refuses a second turn for the same player', () => {
    const turns = [turn({id: 't1', pairId: 'p1', playerId: 'a', finishedAt: 5000})]
    expect(checkClaim(round(), p, turns, 'a', 6000)).toEqual({
      ok: false,
      reason: 'already_answered',
    })
  })

  it('refuses outside a live round or outside the pair', () => {
    expect(checkClaim(round({status: 'done'}), p, [], 'a', 0)).toEqual({
      ok: false,
      reason: 'round_not_live',
    })
    expect(checkClaim(round(), p, [], 'c', 0)).toEqual({ok: false, reason: 'not_paired'})
  })
})

describe('checkFinish', () => {
  it('finishes my open turn now, clamped to the deadline', () => {
    const turns = [turn({id: 't1', pairId: 'p1', playerId: 'a', startedAt: 0})]
    expect(checkFinish(round(), turns, 'a', 5000)).toEqual({
      ok: true,
      finish: {turnId: 't1', finishedAt: 5000},
    })
    expect(checkFinish(round({overtime: 'hard'}), turns, 'a', 999_999)).toEqual({
      ok: true,
      finish: {turnId: 't1', finishedAt: 60_000},
    })
  })

  it('is a no-op twice and refused without a turn', () => {
    const done = [turn({id: 't1', pairId: 'p1', playerId: 'a', finishedAt: 10})]
    expect(checkFinish(round(), done, 'a', 20)).toEqual({ok: true, finish: null})
    expect(checkFinish(round(), done, 'b', 20)).toEqual({ok: false, reason: 'no_open_turn'})
  })
})

describe('phaseOf', () => {
  it('walks a pair from ready to done', () => {
    const t1 = turn({id: 't1', pairId: 'p1', playerId: 'a', startedAt: 0})
    const base = snapshot({pairs: [p]})
    expect(phaseOf(base, round(), 'a', 0)).toBe('ready')
    expect(phaseOf({...base, turns: [t1]}, round(), 'a', 1)).toBe('speaking')
    expect(phaseOf({...base, turns: [t1]}, round(), 'b', 1)).toBe('partner_speaking')
    const t1Done = {...t1, finishedAt: 10}
    expect(phaseOf({...base, turns: [t1Done]}, round(), 'a', 11)).toBe('answered')
    expect(phaseOf({...base, turns: [t1Done]}, round(), 'b', 11)).toBe('ready')
    const t2 = turn({id: 't2', pairId: 'p1', playerId: 'b', startedAt: 20, finishedAt: 30})
    expect(phaseOf({...base, turns: [t1Done, t2]}, round(), 'b', 31)).toBe('pair_done')
  })

  it('waits without a live round and sits out the odd player under sit-out', () => {
    expect(phaseOf(snapshot(), null, 'a', 0)).toBe('waiting')
    const three = snapshot({
      players: snapshot().players.slice(0, 3),
      pairs: [p],
    })
    expect(phaseOf(three, round({oddRule: 'sitout'}), 'c', 0)).toBe('sitting_out')
    expect(phaseOf(three, round(), 'c', 0)).toBe('unpaired')
  })
})

describe('drawQuestion', () => {
  it('prefers unused questions and falls back to the whole deck', () => {
    expect(drawQuestion(['q1', 'q2', 'q3'], new Set(['q1', 'q2']), () => 0.99)).toBe('q3')
    expect(drawQuestion(['q1', 'q2'], new Set(['q1', 'q2']), () => 0.5)).toBe('q2')
    expect(drawQuestion([], new Set(), () => 0)).toBeNull()
  })
})
