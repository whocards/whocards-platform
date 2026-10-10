import {describe, expect, it} from 'vitest'
import {round, snapshot} from '../fixtures.test-utils'
import {canMoveGame, canMoveRound, checkStartRound, currentRound} from './status'

describe('status transitions', () => {
  it('only moves forward', () => {
    expect(canMoveGame('lobby', 'live')).toBe(true)
    expect(canMoveGame('live', 'ended')).toBe(true)
    expect(canMoveGame('ended', 'live')).toBe(false)
    expect(canMoveGame('live', 'lobby')).toBe(false)
    expect(canMoveRound('pending', 'live')).toBe(true)
    expect(canMoveRound('live', 'done')).toBe(true)
    expect(canMoveRound('done', 'live')).toBe(false)
    expect(canMoveRound('pending', 'done')).toBe(false)
  })
})

describe('checkStartRound', () => {
  it('starts one pending round at a time in a live game', () => {
    const r2 = round({id: 'r2', n: 2, status: 'pending'})
    const s = snapshot({rounds: [round({status: 'done'}), r2]})
    expect(checkStartRound(s, r2)).toEqual({ok: true})
    expect(checkStartRound({...s, rounds: [round(), r2]}, r2)).toEqual({
      ok: false,
      reason: 'other_round_live',
    })
    expect(checkStartRound(s, round())).toEqual({ok: false, reason: 'round_not_pending'})
    const lobby = {...s, game: {...s.game, status: 'lobby' as const}}
    expect(checkStartRound(lobby, r2)).toEqual({ok: false, reason: 'game_not_live'})
  })
})

describe('currentRound', () => {
  it('prefers the live round, else the latest done one', () => {
    const r1 = round({status: 'done'})
    const r2 = round({id: 'r2', n: 2, status: 'done'})
    const r3 = round({id: 'r3', n: 3, status: 'pending'})
    expect(currentRound(snapshot({rounds: [r2, r1, r3]}))?.id).toBe('r2')
    expect(currentRound(snapshot({rounds: [r1, {...r3, status: 'live'}]}))?.id).toBe('r3')
    expect(currentRound(snapshot({rounds: [r3]}))).toBeNull()
  })
})
