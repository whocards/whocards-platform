import {describe, expect, it} from 'vitest'

import {readPairCode} from './pair-code'

describe('readPairCode', () => {
  it('normalises typed and scanned codes', () => {
    expect(readPairCode(' k7mq ')).toBe('K7MQ')
  })

  it('rejects anything that is not a bare code', () => {
    expect(readPairCode('https://whocards.cc/events/sdd-2026?code=ABCD')).toBeNull()
    expect(readPairCode('')).toBeNull()
  })
})
