import {describe, expect, it} from 'vitest'

import {
  DEFAULT_LANGUAGE,
  getLanguageName,
  isLanguageCode,
  LANGUAGE_CODES,
  pool,
  poolQuestionIds,
} from './index'

describe('pool', () => {
  it('holds 66 questions', () => {
    expect(poolQuestionIds).toHaveLength(66)
    expect(Object.keys(pool)).toHaveLength(66)
  })

  it('has every Pool language present on every question', () => {
    const expected = LANGUAGE_CODES.toSorted()
    for (const id of poolQuestionIds) {
      expect(Object.keys(pool[id] ?? {}).toSorted()).toEqual(expected)
    }
  })
})

describe('languages', () => {
  it('ships 14 language codes including the default', () => {
    expect(LANGUAGE_CODES).toHaveLength(14)
    expect(LANGUAGE_CODES).toContain(DEFAULT_LANGUAGE)
  })

  it('resolves and validates language codes', () => {
    expect(isLanguageCode('en')).toBe(true)
    expect(isLanguageCode('xx')).toBe(false)
    expect(getLanguageName('en')).toBe('English')
    expect(getLanguageName('xx')).toBeUndefined()
  })
})
