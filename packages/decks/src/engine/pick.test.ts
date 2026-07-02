import {describe, expect, it} from 'vitest'

import {DEFAULT_GAME, GAME_IDS, isGameId} from './games'
import {getInitialPick, pickReducer} from './pick'
import type {PickState} from './pick'

describe('games', () => {
  it('validates game ids', () => {
    for (const id of GAME_IDS) expect(isGameId(id)).toBe(true)
    expect(isGameId('nope')).toBe(false)
    expect(isGameId(DEFAULT_GAME)).toBe(true)
  })
})

describe('pickReducer', () => {
  const ids = ['a', 'b', 'c']
  const reducer = pickReducer(ids)

  it('starts on the pick screen with nothing dealt', () => {
    const state = getInitialPick(ids)
    expect(state.phase).toBe('pick')
    expect(state.dealt).toBe(false)
    expect(state.nav.idx).toBe(0)
    expect(state.nav.ids.toSorted()).toEqual(ids.toSorted())
  })

  it('reveals the initial draw on the first pick without advancing', () => {
    const initial = getInitialPick(ids)
    const state = reducer(initial, {type: 'pick'})
    expect(state).toEqual({nav: initial.nav, phase: 'card', dealt: true})
  })

  it('returns to the pick screen on next without touching nav', () => {
    const onCard: PickState = {nav: {ids, idx: 1}, phase: 'card', dealt: true}
    expect(reducer(onCard, {type: 'next'})).toEqual({...onCard, phase: 'pick'})
  })

  it('advances the nav on every pick after the first deal', () => {
    const onPick: PickState = {nav: {ids, idx: 0}, phase: 'pick', dealt: true}
    const state = reducer(onPick, {type: 'pick'})
    expect(state.phase).toBe('card')
    expect(state.nav.idx).toBe(1)
  })

  it('ignores pick while a card is revealed', () => {
    const onCard: PickState = {nav: {ids, idx: 1}, phase: 'card', dealt: true}
    expect(reducer(onCard, {type: 'pick'})).toBe(onCard)
  })

  it('re-reads the last card on previous from the pick screen', () => {
    const onPick: PickState = {nav: {ids, idx: 1}, phase: 'pick', dealt: true}
    expect(reducer(onPick, {type: 'previous'})).toEqual({...onPick, phase: 'card'})
  })

  it('ignores previous on the pick screen before anything is dealt', () => {
    const initial = getInitialPick(ids)
    expect(reducer(initial, {type: 'previous'})).toBe(initial)
  })

  it('steps back through history on previous from a card, clamped at the first', () => {
    const onCard: PickState = {nav: {ids, idx: 1}, phase: 'card', dealt: true}
    const back = reducer(onCard, {type: 'previous'})
    expect(back).toEqual({...onCard, nav: {ids, idx: 0}})
    expect(reducer(back, {type: 'previous'})).toBe(back)
  })

  it('inherits the endless cycle append from navReducer', () => {
    const atEnd: PickState = {nav: {ids, idx: ids.length - 1}, phase: 'pick', dealt: true}
    const state = reducer(atEnd, {type: 'pick'})
    expect(state.nav.idx).toBe(ids.length)
    expect(state.nav.ids).toHaveLength(ids.length * 2)
    expect(state.nav.ids.slice(ids.length).toSorted()).toEqual(ids.toSorted())
  })
})
