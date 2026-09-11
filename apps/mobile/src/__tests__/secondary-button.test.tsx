/**
 * Tests for src/components/secondary-button.tsx (issue #176) — the app's
 * first secondary-button, ported from the website's `.btn-secondary`
 * (apps/website/src/styles/base.css): a filled gray pill, white label. Its
 * only current caller is the home screen's Settings entry point.
 */
import React from 'react'
import {Text} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'
import {colors, fonts} from '@whocards/tokens'

import {resolvedStyle} from '@/test-utils/resolved-style'

// PressableScale drives its press animation through react-native-reanimated /
// react-native-worklets, whose native module isn't available under plain
// jest-expo (unrelated to this test — see pressable-scale.tsx and
// player-bar.test.tsx for the same swap).
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

import {SecondaryButton} from '../components/secondary-button'

describe('SecondaryButton', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn()
    await render(<SecondaryButton label="Settings" onPress={onPress} />)
    await fireEvent.press(screen.getByText('Settings'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('defaults its accessibilityLabel to the visible label', async () => {
    await render(<SecondaryButton label="Settings" onPress={() => {}} />)
    expect(screen.getByLabelText('Settings')).toBeTruthy()
  })

  it('accepts an explicit accessibilityLabel override', async () => {
    await render(
      <SecondaryButton label="Settings" accessibilityLabel="Open settings" onPress={() => {}} />
    )
    expect(screen.getByLabelText('Open settings')).toBeTruthy()
    expect(screen.queryByLabelText('Settings')).toBeNull()
  })

  it('styles its label from the design tokens — white, on the sans face, bold', async () => {
    // Reading the resolved style rather than the `className` string: NativeWind
    // v5 compiles the class away before it reaches the element, so a className
    // assertion would still pass with the whole style pipeline broken.
    await render(<SecondaryButton label="Settings" onPress={() => {}} />)
    expect(resolvedStyle(screen.getByText('Settings'))).toMatchObject({
      color: colors.white,
      fontFamily: fonts.sans.family,
      fontWeight: 700,
    })
  })

  it('renders an optional leading icon', async () => {
    await render(
      <SecondaryButton label="Settings" icon={<Text testID="icon">icon</Text>} onPress={() => {}} />
    )
    expect(screen.getByTestId('icon')).toBeTruthy()
  })
})
