/**
 * Component test for src/components/game-settings-page.tsx (issue #189,
 * third pass — extracted from the standalone `GameModal` the second pass
 * built). SettingsModal's own pager wiring (which row navigates here, the
 * slide, back-on-select) is covered by settings-modal.test.tsx; this file
 * covers the page's own content: the catalog renders, a press reports the
 * pick via `onSelect`, and the back arrow reports via `onBack` — this page
 * no longer owns a Modal/backdrop of its own, so there's nothing to test
 * about dismissal here (that's the pager's job now).
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {GameSettingsPage} from '../components/game-settings-page'

const renderPage = (onSelect = jest.fn(), onBack = jest.fn()) =>
  render(<GameSettingsPage current="wh" onSelect={onSelect} onBack={onBack} />)

describe('GameSettingsPage (issue #189, third pass)', () => {
  it('renders the game catalog under a "Choose your game" header', async () => {
    renderPage()
    await screen.findByText('Choose your game')
    expect(screen.getByText('Classic')).toBeTruthy()
    expect(screen.getByText('Pick a Card')).toBeTruthy()
  })

  it('marks the current game selected', async () => {
    renderPage()
    const selected = await screen.findByLabelText('Classic')
    expect(selected.props.accessibilityState).toEqual({selected: true})
    expect(screen.getByLabelText('Pick a Card').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('reports the pressed game via onSelect', async () => {
    const onSelect = jest.fn()
    renderPage(onSelect)
    const pick = await screen.findByLabelText('Pick a Card')
    fireEvent.press(pick)
    expect(onSelect).toHaveBeenCalledWith('pick')
  })

  it('reports the back arrow press via onBack', async () => {
    const onBack = jest.fn()
    renderPage(undefined, onBack)
    await screen.findByText('Choose your game')
    fireEvent.press(screen.getByLabelText('back'))
    expect(onBack).toHaveBeenCalled()
  })
})
