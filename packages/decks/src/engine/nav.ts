import type {QuestionId} from '../types'
import {shuffle} from './shuffle'

export type NavState = {ids: QuestionId[]; idx: number}
export type NavAction = {type: 'next'} | {type: 'previous'} | {type: 'reset'; startId?: string}

/**
 * The play navigation reducer. `next` walks forward, appending a fresh shuffle of
 * the deck whenever it runs off the end (so play is endless); `previous` steps
 * back, clamped at the first card; `reset` re-seeds the deck from a `startId` (a
 * fresh deep link into the already-open deck — see `getInitialNav`). Pure — no
 * React, no DOM — so web (`useReducer`) and mobile drive the exact same behaviour.
 */
export const navReducer =
  (questionIds: QuestionId[]) =>
  (state: NavState, action: NavAction): NavState => {
    switch (action.type) {
      case 'previous':
        return state.idx === 0 ? state : {...state, idx: state.idx - 1}
      case 'next': {
        const ids =
          state.idx >= state.ids.length - 1 ? [...state.ids, ...shuffle(questionIds)] : state.ids
        return {ids, idx: state.idx + 1}
      }
      case 'reset':
        return getInitialNav(questionIds, action.startId)
    }
  }

/**
 * Build the initial nav state. With a `startId` present in the deck, start there
 * keeping the rest in natural order behind it (deep-link friendly); otherwise
 * start on a fresh shuffle. Pure: the caller supplies `startId` (e.g. from a
 * `?q=` param) instead of the engine reading any global.
 */
export const getInitialNav = (questionIds: QuestionId[], startId?: string): NavState => {
  if (startId && questionIds.includes(startId)) {
    return {ids: questionIds, idx: questionIds.indexOf(startId)}
  }
  return {ids: shuffle(questionIds), idx: 0}
}
