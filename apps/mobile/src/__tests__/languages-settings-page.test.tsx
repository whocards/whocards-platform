/** The combined Languages page (issue #460, layout C): the primary or the second list, one at a time. */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {LanguagesSettingsPage} from '../components/languages-settings-page'

const renderPage = async (
  overrides: Partial<React.ComponentProps<typeof LanguagesSettingsPage>> = {}
) => {
  const props = {
    languages: ['en', 'he', 'es'],
    current: 'en',
    secondary: [] as string[],
    onSelect: jest.fn(),
    onChangeSecondary: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  await render(<LanguagesSettingsPage {...props} />)
  return props
}

const selected = (label: string) => screen.getByLabelText(label).props.accessibilityState.selected
const showSecond = () => fireEvent.press(screen.getByLabelText('Show: Second language'))

describe('LanguagesSettingsPage', () => {
  it('marks the current primary and reports a primary pick', async () => {
    const {onSelect} = await renderPage()
    expect(selected('Language: English')).toBe(true)
    expect(selected('Language: Hebrew')).toBe(false)
    await fireEvent.press(screen.getByLabelText('Language: Hebrew'))
    expect(onSelect).toHaveBeenCalledWith('he')
    expect(screen.queryByLabelText('Second language: None')).toBeNull()
  })

  it('selects None when there is no second language, and reports it', async () => {
    const {onChangeSecondary} = await renderPage({secondary: ['he']})
    await showSecond()
    expect(screen.queryByLabelText('Language: English')).toBeNull()
    expect(selected('Second language: None')).toBe(false)
    expect(selected('Second language: Hebrew')).toBe(true)
    await fireEvent.press(screen.getByLabelText('Second language: None'))
    expect(onChangeSecondary).toHaveBeenCalledWith([])
  })

  it('never offers the primary as the second language, and a pick replaces the previous one', async () => {
    const {onChangeSecondary} = await renderPage({secondary: ['he']})
    await showSecond()
    expect(screen.queryByLabelText('Second language: English')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Second language: Spanish'))
    expect(onChangeSecondary).toHaveBeenCalledWith(['es'])
  })

  it('reports the back arrow', async () => {
    const {onBack} = await renderPage()
    await fireEvent.press(screen.getByLabelText('back'))
    expect(onBack).toHaveBeenCalled()
  })
})
