import {describe, expect, it} from 'vitest'
import {pair, player, round, snapshot} from '../fixtures.test-utils'
import type {GameSnapshot} from '../model'
import {checkPair, freeStandbyIds, matchName, metBefore, nameKey, unpairedIds} from './pairing'

const round2 = [round({id: 'r0', n: 0, status: 'done'}), round()]

const withStandby = (s: GameSnapshot, ...ids: string[]): GameSnapshot => ({
  ...s,
  game: {...s.game, settings: {...s.game.settings, standby: ids}},
})

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

  it('refuses someone met in an earlier round while someone new is free', () => {
    const s = snapshot({
      rounds: round2,
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

describe('checkPair in small groups', () => {
  it('lets the only two players meet again', () => {
    const s = snapshot({
      players: [player('a'), player('b')],
      rounds: round2,
      pairs: [pair('p0', ['a', 'b'], 'r0')],
    })
    expect(checkPair(s, round(), 'a', 'b')).toEqual({ok: true, joinPairId: null})
  })

  it('allows a repeat once everyone free has been met', () => {
    const s = snapshot({
      rounds: round2,
      pairs: [
        pair('p0', ['a', 'b'], 'r0'),
        pair('p1', ['c', 'd'], 'r0'),
        pair('px', ['b', 'd'], 'rx'),
        pair('p2', ['a', 'c']),
      ],
    })
    expect(checkPair(s, round(), 'b', 'd').ok).toBe(true)
    const crossed = snapshot({
      rounds: round2,
      pairs: [pair('p0', ['a', 'b'], 'r0'), pair('p1', ['c', 'd'], 'r0')],
    })
    expect(checkPair(crossed, round(), 'a', 'b')).toEqual({ok: false, reason: 'met_before'})
  })

  it('lets the odd one join a met pair as a trio when no one new is left', () => {
    const s = snapshot({
      players: [player('a'), player('b'), player('c')],
      rounds: round2,
      pairs: [pair('p0', ['a', 'b', 'c'], 'r0'), pair('p1', ['a', 'b'])],
    })
    expect(checkPair(s, round(), 'c', 'a')).toEqual({ok: true, joinPairId: 'p1'})
  })

  it('prefers a fresh trio over a met one', () => {
    const s = snapshot({
      players: ['a', 'b', 'c', 'd', 'e'].map((id) => player(id)),
      rounds: round2,
      pairs: [pair('p0', ['e', 'a'], 'r0'), pair('p1', ['a', 'b']), pair('p2', ['c', 'd'])],
    })
    expect(checkPair(s, round(), 'e', 'a')).toEqual({ok: false, reason: 'met_before'})
    expect(checkPair(s, round(), 'e', 'c')).toEqual({ok: true, joinPairId: 'p2'})
  })
})

describe('checkPair with a standby facilitator', () => {
  const players = ['a', 'b', 'c', 'f'].map((id) => player(id))

  it('refuses the facilitator while other players are free', () => {
    const s = withStandby(snapshot({players}), 'f')
    expect(checkPair(s, round(), 'a', 'f')).toEqual({ok: false, reason: 'standby_partner'})
    expect(checkPair(s, round(), 'f', 'a')).toEqual({ok: false, reason: 'standby_partner'})
  })

  it('pairs the odd one out with the facilitator either way round, even under sit-out', () => {
    const s = withStandby(snapshot({players, pairs: [pair('p1', ['a', 'b'])]}), 'f')
    expect(checkPair(s, round({oddRule: 'sitout'}), 'c', 'f')).toEqual({ok: true, joinPairId: null})
    expect(checkPair(s, round(), 'f', 'c')).toEqual({ok: true, joinPairId: null})
    expect(checkPair(s, round(), 'f', 'a')).toEqual({ok: false, reason: 'partner_busy'})
  })

  it('never makes a trio with a facilitator or pairs two facilitators', () => {
    const s = withStandby(
      snapshot({players: [...players, player('g')], pairs: [pair('p1', ['c', 'f'])]}),
      'f',
      'g'
    )
    expect(checkPair(s, round(), 'a', 'c')).toEqual({ok: false, reason: 'partner_busy'})
    const two = withStandby(snapshot({players: [...players, player('g')]}), 'f', 'g')
    expect(checkPair(two, round(), 'f', 'g')).toEqual({ok: false, reason: 'standby_partner'})
  })

  it('ignores the facilitator when looking for someone new', () => {
    const s = withStandby(
      snapshot({players, rounds: round2, pairs: [pair('p0', ['a', 'b'], 'r0')]}),
      'f'
    )
    const sitout = round({oddRule: 'sitout'})
    const pairsUp = {...s, pairs: [...s.pairs, pair('p1', ['c', 'f'])]}
    expect(checkPair(pairsUp, sitout, 'a', 'b')).toEqual({ok: true, joinPairId: null})
    expect(unpairedIds(s, 'r1')).toEqual(['a', 'b', 'c'])
    expect(freeStandbyIds(s, 'r1')).toEqual(['f'])
  })
})

describe('matchName', () => {
  it('compares names trimmed, case- and accent-insensitively', () => {
    expect(nameKey('  Áron   Kiss ')).toBe('aron kiss')
    expect(nameKey('ŐRSÉG')).toBe(nameKey('orseg'))
  })

  it('finds other players by name and flags who I can pair with', () => {
    const s = snapshot({
      players: [
        player('a', {name: 'Anna'}),
        player('b', {name: 'anna'}),
        player('c', {name: 'Ánna'}),
      ],
      pairs: [pair('p1', ['b', 'c'])],
    })
    const found = matchName(s, round({oddRule: 'sitout'}), 'a', 'ANNA ')
    expect(found.matches.map((p) => p.id)).toEqual(['b', 'c'])
    expect(found.eligible).toEqual([])
  })
})

describe('metBefore / unpairedIds', () => {
  it('collects partners across rounds and lists who is still free', () => {
    const s = snapshot({
      rounds: round2,
      pairs: [pair('p0', ['a', 'b', 'c'], 'r0'), pair('p1', ['a', 'd'])],
    })
    expect([...metBefore(s, 'a')].toSorted()).toEqual(['b', 'c', 'd'])
    expect(unpairedIds(s, 'r1')).toEqual(['b', 'c'])
  })
})
