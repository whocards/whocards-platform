/**
 * Tests for src/components/player-bar.tsx
 *
 * Covers the `multiLanguage` prop (issue #148 review, finding 1): the bottom-bar
 * button that opens the language/display-settings sheet is now always shown
 * (Tabletop mode is available on every deck, not just multi-language ones), so
 * its visible label and accessibilityLabel must stop promising a language
 * choice that isn't there for a single-language deck.
 *
 * Also covers the Theme Display setting reaching this bar (issue #173): this
 * bar is chrome around the always-dark Card, not the Card itself, so its icon
 * color (a raw `Ionicons` prop, not expressible as a `dark:` class) must follow
 * the resolved scheme, same as every other themed sheet/screen.
 *
 * Also covers the Exit button (issue #186): the floating top-right close chip
 * moved into this bar as a proper icon+label action, keeping its old
 * `accessibilityLabel="exit deck"` for Maestro/VoiceOver continuity.
 */
import React from 'react'
import {Ionicons} from '@expo/vector-icons'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {colorScheme} from 'nativewind'
import {colors} from '@whocards/tokens'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

afterEach(() => {
  // NativeWind's colorScheme is a global observable — reset it so a test that
  // sets it doesn't bleed into whichever test runs next (mirrors theme-modal.test.tsx).
  act(() => colorScheme.set('system'))
})

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
      onExit={noop}
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

describe('PlayerBar — Exit button (issue #186)', () => {
  it('renders an Exit action, mid-bar right after Back, with the legacy "exit deck" label', () => {
    renderBar()
    expect(screen.getByText('Exit')).toBeTruthy()
    expect(screen.getByLabelText('exit deck')).toBeTruthy()
  })

  it('calls onExit when pressed', () => {
    const onExit = jest.fn()
    renderBar({onExit})
    fireEvent.press(screen.getByLabelText('exit deck'))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('is present regardless of showShare/showLanguage — Exit is the only exit once the top chip is gone', () => {
    renderBar({showShare: false, showLanguage: false})
    expect(screen.getByLabelText('exit deck')).toBeTruthy()
  })
})

describe('PlayerBar — themed icon color (issue #173)', () => {
  it('uses white icons when the resolved scheme is dark', () => {
    act(() => colorScheme.set('dark'))
    renderBar()
    const icons = screen.UNSAFE_getAllByType(Ionicons)
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.props.color).toBe(colors.white)
    }
  })

  it('uses darker icons when the resolved scheme is light', () => {
    act(() => colorScheme.set('light'))
    renderBar()
    const icons = screen.UNSAFE_getAllByType(Ionicons)
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.props.color).toBe(colors.darker)
    }
  })
})
