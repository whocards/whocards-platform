import {describe, expect, it} from 'vitest'
import {hasDeckLanguage} from './language'
import {signupLanguage, takeTranslatePrompt} from './translate-prompt'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  }
}

const HOUR = 60 * 60 * 1000

describe('translator prompt (#391)', () => {
  it('shows once, on the 2nd session, for a language with no deck', () => {
    const storage = memoryStorage()
    expect(takeTranslatePrompt('id-ID', storage, '/', 0)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, '/', 10 * 60 * 1000)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, '/', 2 * HOUR)).toBe(true)
    expect(takeTranslatePrompt('id-ID', storage, '/', 2 * HOUR + 1000)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, '/', 5 * HOUR)).toBe(false)
  })

  it('never shows for a language that has a deck', () => {
    const storage = memoryStorage()
    for (const at of [0, 2 * HOUR, 4 * HOUR])
      expect(takeTranslatePrompt('de-AT', storage, '/', at)).toBe(false)
  })

  it('waits out /play and /play/*, then shows on the next page', () => {
    const storage = memoryStorage()
    takeTranslatePrompt('id-ID', storage, '/', 0)
    expect(takeTranslatePrompt('id-ID', storage, '/play', 2 * HOUR)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, '/play/work', 2 * HOUR + 1000)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, '/playground', 2 * HOUR + 2000)).toBe(true)
  })

  it('sends the language code while the pre-fill is untouched, else what was typed', () => {
    expect(signupLanguage('Indonesian', 'id-ID')).toBe('id')
    expect(signupLanguage('Dutch', 'nl_NL')).toBe('nl')
    expect(signupLanguage('Bahasa Indonesia', 'id-ID')).toBe('Bahasa Indonesia')
  })

  it('maps browser tags onto deck languages, including ja for the jp deck', () => {
    expect(['en-US', 'pt_BR', 'ja-JP', 'zh-TW', 'he'].every(hasDeckLanguage)).toBe(true)
    expect(['nl-NL', 'id', 'ru-RU'].some(hasDeckLanguage)).toBe(false)
  })
})
