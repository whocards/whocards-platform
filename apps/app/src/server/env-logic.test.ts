import {describe, expect, it} from 'vitest'

import {requiresExplicitBetterAuthUrl} from './env-logic'

describe('requiresExplicitBetterAuthUrl', () => {
  it('is required in production', () => {
    expect(requiresExplicitBetterAuthUrl('production')).toBe(true)
  })

  it('is not required in development, test, or unset', () => {
    expect(requiresExplicitBetterAuthUrl('development')).toBe(false)
    expect(requiresExplicitBetterAuthUrl('test')).toBe(false)
    expect(requiresExplicitBetterAuthUrl(undefined)).toBe(false)
  })
})
