import React from 'react'
import {Text} from 'react-native'
import {act, render, screen} from '@testing-library/react-native'

import en from '../i18n/en.json'
import {NATIVE_LANGUAGE_NAMES, setUiLanguage, translate, useT} from '../lib/i18n'

const CODES = Object.keys(NATIVE_LANGUAGE_NAMES)
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).toSorted()

const Probe = () => {
  const t = useT()
  return <Text>{t('settings.language')}</Text>
}

describe('i18n — the app speaks the Language', () => {
  afterEach(() => setUiLanguage('en'))

  it.each(CODES)('%s has every key, with the same placeholders as English', (code) => {
    const catalog: unknown = require(`../i18n/${code}.json`)
    const entries = new Map(Object.entries(catalog ?? {}))
    for (const [key, english] of Object.entries(en)) {
      const text = entries.get(key)
      expect([code, key, typeof text]).toEqual([code, key, 'string'])
      expect([code, key, placeholders(String(text))]).toEqual([code, key, placeholders(english)])
    }
  })

  it('fills placeholders and falls back to English for an unknown language', () => {
    expect(translate('home.count', {cards: 66, languages: 14})).toBe('66 cards · 14 languages')
    expect(translate('home.play', undefined, 'xx')).toBe('Play')
  })

  it('re-renders words when the Language changes', async () => {
    await render(<Probe />)
    expect(screen.getByText('Language')).toBeTruthy()
    await act(async () => setUiLanguage('de'))
    expect(screen.queryByText('Language')).toBeNull()
    expect(screen.getByText(translate('settings.language', undefined, 'de'))).toBeTruthy()
  })
})
