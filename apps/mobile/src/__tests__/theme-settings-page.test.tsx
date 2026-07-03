/**
 * Component test for src/components/theme-settings-page.tsx (issue #189,
 * third pass — extracted from the standalone `ThemeModal` the second pass
 * built). SettingsModal's own pager wiring (which row navigates here, the
 * slide, back-on-select) is covered by settings-modal.test.tsx; this file
 * covers the page's own content: the OPTIONS row, and the back arrow
 * reporting via `onBack` — this page no longer owns a Modal, backdrop, or
 * its own `<StatusBar>` override (settings-modal.tsx's single Modal is the
 * only one now), so there's nothing to test about those here.
 */
import React from 'react'
import {fireEvent, render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {ThemeSettingsPage} from '../components/theme-settings-page'

const renderPage = (
  current: 'system' | 'light' | 'dark' = 'system',
  onSelect = jest.fn(),
  onBack = jest.fn()
) => render(<ThemeSettingsPage current={current} onSelect={onSelect} onBack={onBack} />)

describe('ThemeSettingsPage — options (issue #189, third pass)', () => {
  it('marks the current theme selected', async () => {
    renderPage('dark')
    const selected = await screen.findByLabelText('Theme: Dark')
    expect(selected.props.accessibilityState).toEqual({selected: true})
    expect(screen.getByLabelText('Theme: System').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('reports the pressed option via onSelect', async () => {
    const onSelect = jest.fn()
    renderPage('system', onSelect)
    const lightOption = await screen.findByLabelText('Theme: Light')
    fireEvent.press(lightOption)
    expect(onSelect).toHaveBeenCalledWith('light')
  })

  it('reports the back arrow press via onBack', async () => {
    const onBack = jest.fn()
    renderPage('system', undefined, onBack)
    await screen.findByText('Theme')
    fireEvent.press(screen.getByLabelText('back'))
    expect(onBack).toHaveBeenCalled()
  })
})
