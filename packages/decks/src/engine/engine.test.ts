import {describe, expect, it} from 'vitest'

import {getDirection} from './direction'
import {getInitialNav, navReducer} from './nav'
import {shuffle} from './shuffle'

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = ['1', '2', '3', '4', '5']
    const frozen = [...input]
    const out = shuffle(input)
    expect(input).toEqual(frozen) // input untouched
    expect(out).not.toBe(input)
    expect(out.toSorted()).toEqual(input.toSorted())
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })
})

describe('navReducer', () => {
  const ids = ['a', 'b', 'c']
  const reducer = navReducer(ids)

  it('advances on next', () => {
    expect(reducer({ids, idx: 0}, {type: 'next'})).toEqual({ids, idx: 1})
  })

  it('clamps previous at the first card', () => {
    const state = {ids, idx: 0}
    expect(reducer(state, {type: 'previous'})).toBe(state)
  })

  it('steps back on previous', () => {
    expect(reducer({ids, idx: 2}, {type: 'previous'})).toEqual({ids, idx: 2 - 1})
  })

  it('appends a fresh shuffle when running off the end (endless play)', () => {
    const next = reducer({ids, idx: ids.length - 1}, {type: 'next'})
    expect(next.idx).toBe(ids.length)
    expect(next.ids).toHaveLength(ids.length * 2)
    expect(next.ids.slice(ids.length).toSorted()).toEqual(ids.toSorted())
  })
})

describe('getInitialNav', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('starts on a deep-linked id, keeping natural order', () => {
    expect(getInitialNav(ids, 'c')).toEqual({ids, idx: 2})
  })

  it('shuffles from the start when there is no valid startId', () => {
    const nav = getInitialNav(ids, 'nope')
    expect(nav.idx).toBe(0)
    expect(nav.ids.toSorted()).toEqual(ids.toSorted())
  })
})

describe('getDirection', () => {
  it('detects RTL languages', () => {
    expect(getDirection('he')).toBe('rtl')
  })

  it('treats LTR languages (and junk) as ltr', () => {
    expect(getDirection('en')).toBe('ltr')
    expect(getDirection('zz-not-a-locale')).toBe('ltr')
  })
})
