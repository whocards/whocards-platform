/**
 * Tests for src/components/player-bar.tsx
 *
 * Covers the `multiLanguage` prop (issue #148 review, finding 1): the bottom-bar
 * button that opens the language/display-settings sheet is now always shown
 * (Tabletop mode is available on every deck, not just multi-language ones), so
 * its visible label and accessibilityLabel must stop promising a language
 * choice that isn't there for a single-language deck.
 */
import React from 'react'
import {render, screen} from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

// PressableScale drives its press animation through react-native-reanimated /
// react-native-worklets, whose native module isn't available under plain
// jest-expo (unrelated to this test — see pressable-scale.tsx). Swap it for a
// plain Pressable so this file only exercises PlayerBar's label/icon logic.
jest.mock('@/components/pressable-scale', () => {
  const RN = require('react-native')
  return {
    PressableScale: ({onPress, children, ...accessibility}: Record<string, unknown>) => (
      <RN.Pressable onPress={onPress} {...accessibility}>
        {children as React.ReactNode}
      </RN.Pressable>
    ),
  }
})

import {PlayerBar} from '../components/player-bar'

const noop = () => {}

const renderBar = (props: Partial<React.ComponentProps<typeof PlayerBar>> = {}) =>
  render(
    <PlayerBar
      showLanguage
      onPrevious={noop}
      onNext={noop}
      onShare={noop}
      onLanguage={noop}
      {...props}
    />
  )

describe('PlayerBar — language/display button labeling', () => {
  it('defaults to the "Language" label and accessibilityLabel (multiLanguage defaults true)', () => {
    renderBar()
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByLabelText('change language')).toBeTruthy()
  })

  it('shows "Language" / "change language" for a multi-language deck', () => {
    renderBar({multiLanguage: true})
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByLabelText('change language')).toBeTruthy()
    expect(screen.queryByText('Display')).toBeNull()
  })

  it('shows "Display" / "display settings" for a single-language deck — no language promise', () => {
    renderBar({multiLanguage: false})
    expect(screen.getByText('Display')).toBeTruthy()
    expect(screen.getByLabelText('display settings')).toBeTruthy()
    expect(screen.queryByText('Language')).toBeNull()
    expect(screen.queryByLabelText('change language')).toBeNull()
  })

  it('renders no button at all when showLanguage is false, regardless of multiLanguage', () => {
    renderBar({showLanguage: false, multiLanguage: false})
    expect(screen.queryByText('Display')).toBeNull()
    expect(screen.queryByText('Language')).toBeNull()
  })
})
