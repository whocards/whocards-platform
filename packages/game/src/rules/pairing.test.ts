import {describe, expect, it} from 'vitest'
import {pair, round, snapshot} from '../fixtures.test-utils'
import {checkPair, metBefore, unpairedIds} from './pairing'

describe('checkPair', () => {
  it('pairs two free players who have not met', () => {
    expect(checkPair(snapshot(), round(), 'a', 'b')).toEqual({ok: true, joinPairId: null})
  })

  it('refuses when the game is over or the round is not live', () => {
    const ended = snapshot({game: {...snapshot().game, status: 'ended'}})
    expect(checkPair(ended, round(), 'a', 'b')).toEqual({ok: false, reason: 'game_over'})
    expect(checkPair(snapshot(), round({status: 'pending'}), 'a', 'b')).toEqual({
      ok: false,
      reason: 'round_not_live',
    })
  })

  it('refuses pairing with yourself or while already paired', () => {
    expect(checkPair(snapshot(), round(), 'a', 'a')).toEqual({ok: false, reason: 'self'})
    const s = snapshot({pairs: [pair('p1', ['a', 'b'])]})
    expect(checkPair(s, round(), 'a', 'c')).toEqual({ok: false, reason: 'already_paired'})
  })

  it('refuses someone met in an earlier round', () => {
    const s = snapshot({
      rounds: [round({id: 'r0', n: 0, status: 'done'}), round()],
      pairs: [pair('p0', ['a', 'b'], 'r0')],
    })
    expect(checkPair(s, round(), 'a', 'b')).toEqual({ok: false, reason: 'met_before'})
    expect(checkPair(s, round(), 'a', 'c').ok).toBe(true)
  })

  it('joins a two-person pair as a trio when the round allows it', () => {
    const s = snapshot({pairs: [pair('p1', ['a', 'b'])]})
    expect(checkPair(s, round(), 'c', 'a')).toEqual({ok: true, joinPairId: 'p1'})
  })

  it('refuses a trio under sit-out, a full trio, or one holding someone already met', () => {
    const s = snapshot({pairs: [pair('p1', ['a', 'b'])]})
    expect(checkPair(s, round({oddRule: 'sitout'}), 'c', 'a')).toEqual({
      ok: false,
      reason: 'partner_busy',
    })

    const full = snapshot({pairs: [pair('p1', ['a', 'b', 'c'])]})
    expect(checkPair(full, round(), 'd', 'a')).toEqual({ok: false, reason: 'partner_busy'})

    const met = snapshot({
      rounds: [round({id: 'r0', n: 0, status: 'done'}), round()],
      pairs: [pair('p0', ['b', 'c'], 'r0'), pair('p1', ['a', 'b'])],
    })
    expect(checkPair(met, round(), 'c', 'a')).toEqual({ok: false, reason: 'met_before'})
  })
})

describe('metBefore / unpairedIds', () => {
  it('collects partners across rounds and lists who is still free', () => {
    const s = snapshot({
      rounds: [round({id: 'r0', n: 0, status: 'done'}), round()],
      pairs: [pair('p0', ['a', 'b', 'c'], 'r0'), pair('p1', ['a', 'd'])],
    })
    expect([...metBefore(s, 'a')].toSorted()).toEqual(['b', 'c', 'd'])
    expect(unpairedIds(s, 'r1')).toEqual(['b', 'c'])
  })
})
