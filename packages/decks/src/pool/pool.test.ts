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

  // At least, not exactly: a language part-way through translation is on some Questions only.
  it('has every Pool language present on every question', () => {
    for (const id of poolQuestionIds) {
      expect(Object.keys(pool[id] ?? {})).toEqual(expect.arrayContaining(LANGUAGE_CODES))
    }
  })
})

const LAUNCH_LANGUAGES = [
  'da',
  'de',
  'en',
  'es',
  'fr',
  'he',
  'hu',
  'pl',
  'pt',
  'pt-br',
  'ro',
  'sr',
  'zh',
  'jp',
]

describe('languages', () => {
  it('ships at least the 14 launch languages, including the default', () => {
    expect(LANGUAGE_CODES).toEqual(expect.arrayContaining(LAUNCH_LANGUAGES))
    expect(LANGUAGE_CODES).toContain(DEFAULT_LANGUAGE)
  })

  it('resolves and validates language codes', () => {
    expect(isLanguageCode('en')).toBe(true)
    expect(isLanguageCode('xx')).toBe(false)
    expect(getLanguageName('en')).toBe('English')
    expect(getLanguageName('xx')).toBeUndefined()
  })
})
