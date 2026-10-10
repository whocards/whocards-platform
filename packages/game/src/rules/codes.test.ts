import {describe, expect, it} from 'vitest'
import {CODE_ALPHABET, codeSchema} from '../schemas'
import {makeCode} from './codes'

describe('makeCode', () => {
  it('draws from the unambiguous alphabet and passes the code schema', () => {
    expect(makeCode(4, () => 0)).toBe('AAAA')
    expect(makeCode(4, () => 0.9999)).toBe('9999')
    const code = makeCode(6, Math.random)
    expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`))
    expect(codeSchema.parse(code.toLowerCase())).toBe(code)
  })
})
