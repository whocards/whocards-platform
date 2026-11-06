import {describe, expect, it} from 'vitest'
import {hasDeckLanguage} from './language'
import {takeTranslatePrompt} from './translate-prompt'

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
    expect(takeTranslatePrompt('id-ID', storage, 0)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, 10 * 60 * 1000)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, 2 * HOUR)).toBe(true)
    expect(takeTranslatePrompt('id-ID', storage, 2 * HOUR + 1000)).toBe(false)
    expect(takeTranslatePrompt('id-ID', storage, 5 * HOUR)).toBe(false)
  })

  it('never shows for a language that has a deck', () => {
    const storage = memoryStorage()
    for (const at of [0, 2 * HOUR, 4 * HOUR])
      expect(takeTranslatePrompt('de-AT', storage, at)).toBe(false)
  })

  it('maps browser tags onto deck languages, including ja for the jp deck', () => {
    expect(['en-US', 'pt_BR', 'ja-JP', 'zh-TW', 'he'].every(hasDeckLanguage)).toBe(true)
    expect(['nl-NL', 'id', 'ru-RU'].some(hasDeckLanguage)).toBe(false)
  })
})
