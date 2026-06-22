import {describe, expect, it} from 'vitest'

import {shouldRecordAnswers} from './recording'

describe('shouldRecordAnswers', () => {
  it('always records in a production build', () => {
    expect(shouldRecordAnswers({dev: false, optIn: false})).toBe(true)
    expect(shouldRecordAnswers({dev: false, optIn: true})).toBe(true)
  })

  it('suppresses recording in dev unless opted in', () => {
    expect(shouldRecordAnswers({dev: true, optIn: false})).toBe(false)
    expect(shouldRecordAnswers({dev: true, optIn: true})).toBe(true)
  })
})
