/**
 * Component test for src/components/settings-sheet-header.tsx (issue #189,
 * third pass — extracted from the near-identical header markup that used to
 * be duplicated across settings-modal.tsx, game-modal.tsx, theme-modal.tsx,
 * and language-modal.tsx; now every page in SettingsModal's single-Modal
 * pager renders one of these).
 *
 * Guards the Pixel-notch fix (#102): on Android, `statusBarTranslucent` draws
 * the sheet behind the status bar, so the header must add the top safe-area
 * inset to clear the display cutout. On iOS the sheet is bottom-anchored and
 * content-hugging (it doesn't reach the status bar in the normal case), so
 * the header keeps its original 16px (`py-4`) top padding there. We assert
 * the resolved header `paddingTop` per platform so a future edit can't
 * silently drop the inset (re-overlapping the clock) or double-pad iOS —
 * this used to be asserted separately in each of the four sheets' own test
 * files; now it only needs covering once, here.
 */
import React from 'react'
import {Platform, StyleSheet} from 'react-native'
import type {ViewStyle} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'

const TOP_INSET = 47 // a representative status-bar/cutout height (e.g. a Pixel)

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: TOP_INSET, bottom: 34, left: 0, right: 0}),
}))

import {SettingsSheetHeader} from '../components/settings-sheet-header'

// Walk up from the title until we find the ancestor whose flattened style sets
// paddingTop — that's the header View carrying the inset fix. Robust whether or not
// NativeWind compiles className→style in the jest environment (the inline style wins
// either way, so the flattened paddingTop is the value under test).
const headerPaddingTop = (): number => {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText('Choose your language')
  while (node) {
    const flat = StyleSheet.flatten(node.props?.style as ViewStyle | undefined)
    if (flat && typeof flat.paddingTop === 'number') return flat.paddingTop
    node = node.parent
  }
  throw new Error('header paddingTop not found')
}

describe('SettingsSheetHeader — Android/iOS inset', () => {
  const originalOS = Platform.OS
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalOS})
  })

  it('adds the top safe-area inset on Android so the title clears the status bar', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'})
    render(<SettingsSheetHeader title="Choose your language" icon="back" onPress={() => {}} />)
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(TOP_INSET + 16)
  })

  it('keeps the original 16px top padding on iOS (bottom-anchored, content-hugging sheet)', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'})
    render(<SettingsSheetHeader title="Choose your language" icon="back" onPress={() => {}} />)
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(16)
  })
})

describe('SettingsSheetHeader — icon variants', () => {
  it('renders a chevron-back labeled "back" for a pushed page', async () => {
    const onPress = jest.fn()
    render(<SettingsSheetHeader title="Theme" icon="back" onPress={onPress} />)
    await screen.findByText('Theme')
    fireEvent.press(screen.getByLabelText('back'))
    expect(onPress).toHaveBeenCalled()
    expect(screen.queryByLabelText('close')).toBeNull()
  })

  it('renders a close "X" labeled "close" for the root menu page', async () => {
    const onPress = jest.fn()
    render(<SettingsSheetHeader title="Settings" icon="close" onPress={onPress} />)
    await screen.findByText('Settings')
    fireEvent.press(screen.getByLabelText('close'))
    expect(onPress).toHaveBeenCalled()
    expect(screen.queryByLabelText('back')).toBeNull()
  })
})
