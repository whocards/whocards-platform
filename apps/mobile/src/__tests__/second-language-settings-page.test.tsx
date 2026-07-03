/**
 * Component test for src/components/second-language-settings-page.tsx (issue
 * #189, owner on-device feedback: "split the second language selector into a
 * separate section in game play options"). Split out of
 * language-settings-page.tsx's old "Also show" section — see this file's own
 * doc comment for why. SettingsModal's own pager wiring (which row navigates
 * here, the rise, auto-returning to the menu on change) is covered by
 * settings-modal.test.tsx; this file covers the page's own content: the
 * "None" option, the language list (primary excluded), the checked state,
 * and the replace/clear semantics carried over from the old "Also show"
 * section (issue #176: at most 1).
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {SecondLanguageSettingsPage} from '../components/second-language-settings-page'

const renderPage = (secondary: string[] = [], onChange = jest.fn(), onBack = jest.fn()) =>
  render(
    <SecondLanguageSettingsPage
      languages={['en', 'he', 'es']}
      current="en"
      secondary={secondary}
      onChange={onChange}
      onBack={onBack}
    />
  )

describe('SecondLanguageSettingsPage — "None" option', () => {
  it('is selected when no secondary is chosen', async () => {
    renderPage([])
    const none = await screen.findByText('None')
    let node: typeof none | null = none
    while (node && node.props?.accessibilityState === undefined) node = node.parent
    expect(node?.props.accessibilityState).toEqual({selected: true})
  })

  it('is not selected once a secondary is chosen', async () => {
    renderPage(['he'])
    const none = await screen.findByText('None')
    let node: typeof none | null = none
    while (node && node.props?.accessibilityState === undefined) node = node.parent
    expect(node?.props.accessibilityState).toEqual({selected: false})
  })

  it('reports an empty array via onChange when pressed', async () => {
    const onChange = jest.fn()
    renderPage(['he'], onChange)
    fireEvent.press(await screen.findByText('None'))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('SecondLanguageSettingsPage — language options (issue #176: at most 1)', () => {
  it('never lists the current primary as an option', async () => {
    renderPage([])
    await screen.findByText('None')
    expect(screen.queryByText('English')).toBeNull()
  })

  it('reflects the checked state of the current secondary', async () => {
    renderPage(['he'])
    const checked = await screen.findByText('Hebrew')
    let node: typeof checked | null = checked
    while (node && node.props?.accessibilityState === undefined) node = node.parent
    expect(node?.props.accessibilityState).toEqual({selected: true})
  })

  it('picking a new secondary REPLACES the previous one (no append-until-cap)', async () => {
    const onChange = jest.fn()
    renderPage(['he'], onChange)
    fireEvent.press(await screen.findByText('Spanish'))
    expect(onChange).toHaveBeenCalledWith(['es'])
  })
})

describe('SecondLanguageSettingsPage — back arrow', () => {
  it('reports the back arrow press via onBack', async () => {
    const onBack = jest.fn()
    renderPage([], jest.fn(), onBack)
    await screen.findByText('None')
    fireEvent.press(screen.getByLabelText('back'))
    expect(onBack).toHaveBeenCalled()
  })
})
