/**
 * Component test for src/components/settings-sheet-header.tsx (issue #189,
 * third pass — extracted from the near-identical header markup that used to
 * be duplicated across settings-modal.tsx, game-modal.tsx, theme-modal.tsx,
 * and language-modal.tsx; now every page in SettingsModal's single-Modal
 * pager renders one of these).
 *
 * Guards the flat-16 header padding on BOTH platforms (owner on-device,
 * 2026-07-03): the header lives in a bottom-anchored sheet capped at 80% of
 * the window, so it can never reach the status bar — the old Android
 * safe-area-inset guard (the #102-era Pixel-notch fix, from when this was a
 * full-height pageSheet) only added a dead band above the title. We assert
 * the resolved `paddingTop` per platform so a future edit can't silently
 * re-add the inset or double-pad either side.
 */
import React from 'react'
import {Platform, StyleSheet} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'

// The header no longer reads safe-area insets at all; keep the mock so the
// test would fail loudly (paddingTop != 16) if someone re-adds inset math.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 47, bottom: 34, left: 0, right: 0}),
}))

import {SettingsSheetHeader} from '../components/settings-sheet-header'

// Walk up from the title until we find the ancestor whose flattened style sets
// paddingTop — that's the header View carrying the inset fix. Robust whether or not
// NativeWind compiles className→style in the jest environment (the inline style wins
// either way, so the flattened paddingTop is the value under test).
const headerPaddingTop = (): number => {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText('Choose your language')
  while (node) {
    const flat = StyleSheet.flatten(node.props?.style)
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

  // The Android status-bar inset guard was removed (owner on-device feedback,
  // 2026-07-03): this header sits in a bottom-anchored sheet capped at 80% of
  // the window, so it can never reach the status bar — the inset only added a
  // big dead band above the title. Flat 16 on both platforms.
  it('uses flat 16px top padding on Android — a bottom sheet never meets the status bar', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'})
    render(<SettingsSheetHeader title="Choose your language" icon="back" onPress={() => {}} />)
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(16)
  })

  it('uses flat 16px top padding on iOS (bottom-anchored, content-hugging sheet)', async () => {
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
