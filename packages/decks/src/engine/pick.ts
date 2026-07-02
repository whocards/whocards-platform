import type {QuestionId} from '../types'
import {getInitialNav, navReducer} from './nav'
import type {NavState} from './nav'

/**
 * The Pick a Card game: a phase machine over the plain nav reducer. `pick`
 * reveals a card (the first deal shows the initial draw; later deals advance
 * the nav), `next` puts the card down and returns to the pick screen without
 * advancing, `previous` re-reads the last card or steps back through history.
 * Draw policy (endless non-repeating shuffle) is inherited from `navReducer`,
 * so cycle detection over `nav.ids.length` keeps working unchanged.
 */
export type PickPhase = 'pick' | 'card'
export type PickState = {nav: NavState; phase: PickPhase; dealt: boolean}
export type PickAction = {type: 'pick'} | {type: 'next'} | {type: 'previous'}

export const getInitialPick = (questionIds: QuestionId[]): PickState => ({
  nav: getInitialNav(questionIds),
  phase: 'pick',
  dealt: false,
})

export const pickReducer = (questionIds: QuestionId[]) => {
  const nav = navReducer(questionIds)
  return (state: PickState, action: PickAction): PickState => {
    switch (action.type) {
      case 'pick':
        if (state.phase === 'card') return state
        return state.dealt
          ? {phase: 'card', dealt: true, nav: nav(state.nav, {type: 'next'})}
          : {phase: 'card', dealt: true, nav: state.nav}
      case 'next':
        return state.phase === 'card' ? {...state, phase: 'pick'} : state
      case 'previous': {
        if (state.phase === 'pick') return state.dealt ? {...state, phase: 'card'} : state
        const previous = nav(state.nav, {type: 'previous'})
        return previous === state.nav ? state : {...state, nav: previous}
      }
    }
  }
}
