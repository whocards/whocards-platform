/**
 * Tests for src/components/secondary-button.tsx (issue #176) — the app's
 * first secondary-button, ported from the website's `.btn-secondary`
 * (apps/website/src/styles/base.css): a filled gray pill, white label. Its
 * only current caller is the home screen's Settings entry point.
 */
import React from 'react'
import {Text} from 'react-native'
import {fireEvent, render, screen} from '@testing-library/react-native'

// PressableScale drives its press animation through react-native-reanimated /
// react-native-worklets, whose native module isn't available under plain
// jest-expo (unrelated to this test — see pressable-scale.tsx and
// player-bar.test.tsx for the same swap).
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

import {SecondaryButton} from '../components/secondary-button'

describe('SecondaryButton', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn()
    render(<SecondaryButton label="Settings" onPress={onPress} />)
    fireEvent.press(screen.getByText('Settings'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('defaults its accessibilityLabel to the visible label', () => {
    render(<SecondaryButton label="Settings" onPress={() => {}} />)
    expect(screen.getByLabelText('Settings')).toBeTruthy()
  })

  it('accepts an explicit accessibilityLabel override', () => {
    render(
      <SecondaryButton label="Settings" accessibilityLabel="Open settings" onPress={() => {}} />
    )
    expect(screen.getByLabelText('Open settings')).toBeTruthy()
    expect(screen.queryByLabelText('Settings')).toBeNull()
  })

  it('renders an optional leading icon', () => {
    render(
      <SecondaryButton label="Settings" icon={<Text testID="icon">icon</Text>} onPress={() => {}} />
    )
    expect(screen.getByTestId('icon')).toBeTruthy()
  })
})
