import {describe, expect, it} from 'vitest'

import {gameErrorOf} from './errors'
import {trpcError} from './state.test-utils'

describe('gameErrorOf', () => {
  it('reads the refusal the server formatter adds', () => {
    expect(gameErrorOf(trpcError({code: 'CONFLICT', refusal: 'partner_answering'}))).toEqual({
      refusal: 'partner_answering',
      unauthorized: false,
      message: 'refused',
    })
  })

  it('flags a missing or stale token', () => {
    expect(gameErrorOf(trpcError({code: 'UNAUTHORIZED', refusal: null})).unauthorized).toBe(true)
    expect(gameErrorOf(trpcError({httpStatus: 401})).unauthorized).toBe(true)
  })

  it('ignores refusals it does not know and plain failures', () => {
    expect(gameErrorOf(trpcError({refusal: 'made_up'})).refusal).toBeNull()
    expect(gameErrorOf(new TypeError('Failed to fetch'))).toEqual({
      refusal: null,
      unauthorized: false,
      message: 'Failed to fetch',
    })
    expect(gameErrorOf('boom').message).toBe('boom')
  })
})
