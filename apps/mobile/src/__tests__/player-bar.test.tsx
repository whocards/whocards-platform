/**
 * Tests for src/components/player-bar.tsx
 *
 * Issue #176 removed the Language/Display button from this bar entirely — every
 * setting (Language, Tabletop mode, Game, Theme) now lives behind the home
 * screen's Settings menu, so the play screens have no settings entry of their
 * own. This bar is back down to just navigation (Back/Next) + Share.
 *
 * Still covers the Theme Display setting reaching this bar (issue #173): this
 * bar is chrome around the always-dark Card, not the Card itself, so its icon
 * color (a raw `Ionicons` prop, not expressible as a `dark:` class) must follow
 * the resolved scheme, same as every other themed sheet/screen.
 *
 * Also covers the Exit button (issue #186): the floating top-right close chip
 * moved into this bar as a proper icon+label action, keeping its old
 * `accessibilityLabel="exit deck"` for Maestro/VoiceOver continuity.
 */
import React from 'react'
import {StyleSheet} from 'react-native'
import {act, fireEvent, render, screen} from '@testing-library/react-native'
import {colorScheme} from 'nativewind'
import {colors} from '@whocards/tokens'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}))

afterEach(async () => {
  // NativeWind's colorScheme is a global observable — reset it so a test that
  // sets it doesn't bleed into whichever test runs next (mirrors
  // settings-modal.test.tsx).
  await act(() => colorScheme.set('system'))
})

// PressableScale drives its press animation through react-native-reanimated /
// react-native-worklets, whose native module isn't available under plain
// jest-expo (unrelated to this test — see pressable-scale.tsx). Swap it for a
// plain Pressable so this file only exercises PlayerBar's label/icon logic.
jest.mock('@/components/pressable-scale', () => {
  const RN = require('react-native')
  return {
    PressableScale: ({
      onPress,
      children,
      ...accessibility
    }: {onPress?: () => void; children?: React.ReactNode} & Record<string, unknown>) => (
      <RN.Pressable onPress={onPress} {...accessibility}>
        {children}
      </RN.Pressable>
    ),
  }
})

import {PlayerBar} from '../components/player-bar'

const noop = () => {}

const renderBar = (props: Partial<React.ComponentProps<typeof PlayerBar>> = {}) =>
  render(<PlayerBar onPrevious={noop} onNext={noop} onShare={noop} onExit={noop} {...props} />)

/**
 * The color of every rendered `Ionicons` glyph.
 *
 * @testing-library/react-native 14 removed the composite `UNSAFE_getAllByType`
 * query — the tree it models is host elements only
 * (https://github.com/callstack/react-native-testing-library/releases/tag/v14.0.0).
 * `Ionicons` renders a host `<Text>` whose flattened style carries both the
 * glyph font and the `color` prop this test is about, so match on that instead.
 */
const iconColors = () =>
  (
    screen.root?.queryAll(
      (node) => StyleSheet.flatten(node.props.style)?.fontFamily === 'ionicons'
    ) ?? []
  ).map((node) => StyleSheet.flatten(node.props.style).color)

describe('PlayerBar — no Language/Display button (issue #176)', () => {
  it('never renders a Language or Display action — that setting moved to the home Settings menu', async () => {
    await renderBar()
    expect(screen.queryByText('Language')).toBeNull()
    expect(screen.queryByText('Display')).toBeNull()
    expect(screen.queryByLabelText('change language')).toBeNull()
    expect(screen.queryByLabelText('display settings')).toBeNull()
  })

  it('renders Back, Share, and Next', async () => {
    await renderBar()
    expect(screen.getByLabelText('previous question')).toBeTruthy()
    expect(screen.getByLabelText('share question')).toBeTruthy()
    expect(screen.getByLabelText('next question')).toBeTruthy()
  })

  it('hides Share when showShare is false, keeping Back and Next', async () => {
    await renderBar({showShare: false})
    expect(screen.queryByLabelText('share question')).toBeNull()
    expect(screen.getByLabelText('previous question')).toBeTruthy()
    expect(screen.getByLabelText('next question')).toBeTruthy()
  })
})

describe('PlayerBar — Exit button (issue #186)', () => {
  it('renders an Exit action, mid-bar right after Back, with the legacy "exit deck" label', async () => {
    await renderBar()
    expect(screen.getByText('Exit')).toBeTruthy()
    expect(screen.getByLabelText('exit deck')).toBeTruthy()
  })

  it('calls onExit when pressed', async () => {
    const onExit = jest.fn()
    await renderBar({onExit})
    await fireEvent.press(screen.getByLabelText('exit deck'))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('is present regardless of showShare — Exit is the only exit once the top chip is gone', async () => {
    await renderBar({showShare: false})
    expect(screen.getByLabelText('exit deck')).toBeTruthy()
  })
})

describe('PlayerBar — themed icon color (issue #173)', () => {
  it('uses white icons when the resolved scheme is dark', async () => {
    await act(() => colorScheme.set('dark'))
    await renderBar()
    const icons = iconColors()
    expect(icons.length).toBeGreaterThan(0)
    for (const color of icons) {
      expect(color).toBe(colors.white)
    }
  })

  it('uses darker icons when the resolved scheme is light', async () => {
    await act(() => colorScheme.set('light'))
    await renderBar()
    const icons = iconColors()
    expect(icons.length).toBeGreaterThan(0)
    for (const color of icons) {
      expect(color).toBe(colors.darker)
    }
  })
})
