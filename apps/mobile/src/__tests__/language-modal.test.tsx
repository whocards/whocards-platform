/**
 * Component test for src/components/language-modal.tsx
 *
 * Guards the Pixel-notch fix (#102): on Android the page-sheet renders behind the
 * status bar, so the header must add the top safe-area inset to clear the display
 * cutout. On iOS the card sheet already insets, so the header keeps its original
 * 16px (`py-4`) top padding. We assert the resolved header `paddingTop` per platform
 * so a future edit can't silently drop the inset (re-overlapping the clock) or
 * double-pad iOS.
 *
 * Also covers the Tabletop mode toggle (issue #148): it renders whenever the
 * caller supplies `onTabletopChange` (regardless of language count, unlike
 * "Also show"), reflects the `tabletop` prop in its checked state, and reports
 * the flipped value on press.
 */
import React from 'react'
import {Platform, StyleSheet} from 'react-native'
import type {ViewStyle} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'

const TOP_INSET = 47 // a representative status-bar/cutout height (e.g. a Pixel)

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: TOP_INSET, bottom: 34, left: 0, right: 0}),
}))

import {LanguageModal} from '../components/language-modal'

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

const renderModal = () =>
  render(
    <LanguageModal
      visible
      languages={['en', 'he']}
      current="en"
      onSelect={() => {}}
      onClose={() => {}}
    />
  )

describe('LanguageModal header inset', () => {
  const originalOS = Platform.OS
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: originalOS})
  })

  it('adds the top safe-area inset on Android so the title clears the status bar', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'})
    renderModal()
    // findBy* flushes the close-icon's async font load inside act(), keeping output clean
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(TOP_INSET + 16)
  })

  it('keeps the original 16px top padding on iOS (the pageSheet card already insets)', async () => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'})
    renderModal()
    await screen.findByText('Choose your language')
    expect(headerPaddingTop()).toBe(16)
  })
})

describe('LanguageModal — Tabletop mode toggle (#148)', () => {
  it('is absent when the caller does not supply onTabletopChange', async () => {
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByText('Choose your language')
    expect(screen.queryByText('Tabletop mode')).toBeNull()
  })

  it('renders even for a single-language deck (unlike "Also show")', async () => {
    render(
      <LanguageModal
        visible
        languages={['en']}
        current="en"
        onSelect={() => {}}
        onTabletopChange={() => {}}
        onClose={() => {}}
      />
    )
    await screen.findByText('Choose your language')
    expect(screen.getByText('Tabletop mode')).toBeTruthy()
    expect(screen.queryByText('Also show')).toBeNull()
  })

  it('reflects the tabletop prop as the switch checked state', async () => {
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        tabletop
        onTabletopChange={() => {}}
        onClose={() => {}}
      />
    )
    const toggle = await screen.findByLabelText('Tabletop mode')
    expect(toggle.props.accessibilityState).toEqual({checked: true})
  })

  it('reports the flipped value on press', async () => {
    const onTabletopChange = jest.fn()
    render(
      <LanguageModal
        visible
        languages={['en', 'he']}
        current="en"
        onSelect={() => {}}
        tabletop={false}
        onTabletopChange={onTabletopChange}
        onClose={() => {}}
      />
    )
    const toggle = await screen.findByLabelText('Tabletop mode')
    fireEvent.press(toggle)
    expect(onTabletopChange).toHaveBeenCalledWith(true)
  })
})
