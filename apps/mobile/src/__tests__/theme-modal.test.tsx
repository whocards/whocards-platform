/**
 * Component test for src/components/theme-modal.tsx (issue #163, review
 * follow-up): guards the `<StatusBar>` override pattern every themed sheet
 * uses — dark surface → light (white) icons, light surface → dark icons —
 * the same pattern the Library screen (`app/index.tsx`) now also follows for
 * its own canvas (PR #167 review: the Library screen was originally missing
 * this override, leaving white status-bar icons over its near-white
 * `canvasLight` background in Light theme).
 *
 * ThemeModal derives its `isDark` from NativeWind's live `useColorScheme()`
 * (the resolved scheme, not the `current` ThemeSetting prop — a "Dark"
 * *selection* still renders the modal's Light-mode sheet surface if the
 * system itself is Light and Dark hasn't been applied yet), so these tests
 * drive the resolved scheme directly via `colorScheme.set()`, exactly like
 * `useThemeSetting()` does under `select()`.
 *
 * Also covers the OPTIONS row: the `current` prop's segment is marked
 * `accessibilityState={{selected: true}}`, and pressing another segment
 * reports that option's value via `onSelect`.
 */
import React from 'react'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {StatusBar} from 'expo-status-bar'
import {colorScheme} from 'nativewind'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

import {ThemeModal} from '../components/theme-modal'

afterEach(() => {
  // NativeWind's colorScheme is a global observable — reset it so a test that
  // sets it doesn't bleed into whichever test runs next.
  act(() => colorScheme.set('system'))
})

const renderModal = (current: 'system' | 'light' | 'dark' = 'system', onSelect = jest.fn()) =>
  render(<ThemeModal visible current={current} onSelect={onSelect} onClose={() => {}} />)

describe('ThemeModal — StatusBar override', () => {
  it('shows light (white) status-bar icons when the resolved scheme is dark', async () => {
    act(() => colorScheme.set('dark'))
    renderModal('dark')
    await screen.findByText('Theme')
    expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light')
  })

  it('shows dark status-bar icons when the resolved scheme is light', async () => {
    act(() => colorScheme.set('light'))
    renderModal('light')
    await screen.findByText('Theme')
    expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('dark')
  })
})

describe('ThemeModal — options', () => {
  it('marks the current theme selected', async () => {
    renderModal('dark')
    const selected = await screen.findByLabelText('Theme: Dark')
    expect(selected.props.accessibilityState).toEqual({selected: true})
    expect(screen.getByLabelText('Theme: System').props.accessibilityState).toEqual({
      selected: false,
    })
  })

  it('reports the pressed option via onSelect', async () => {
    const onSelect = jest.fn()
    renderModal('system', onSelect)
    const lightOption = await screen.findByLabelText('Theme: Light')
    fireEvent.press(lightOption)
    expect(onSelect).toHaveBeenCalledWith('light')
  })
})
