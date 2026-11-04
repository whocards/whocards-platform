import React from 'react'
import {AppState, Linking, Platform, Text} from 'react-native'
import {act, fireEvent, render, screen} from '@testing-library/react-native'

import {VersionGate} from '@/components/version-gate'
import {isBelowMinimum} from '@/lib/version'

const mockQuery = jest.fn()
jest.mock('@/lib/trpc', () => ({trpc: {mobile: {compatibility: {query: () => mockQuery()}}}}))
jest.mock('expo-application', () => ({nativeApplicationVersion: '1.2.0'}))
// Reanimated's native module isn't available under jest-expo (see secondary-button.test.tsx).
jest.mock('@/components/pressable-scale', () => {
  const RN = require('react-native')
  return {
    PressableScale: ({
      onPress,
      children,
      ...rest
    }: {onPress?: () => void; children?: React.ReactNode} & Record<string, unknown>) => (
      <RN.Pressable onPress={onPress} {...rest}>
        {children}
      </RN.Pressable>
    ),
  }
})
jest.mock('@/components/screen-background', () => ({
  ScreenBackground: ({children}: {children: React.ReactNode}) => children,
}))

const storeUrl = {ios: 'https://apps.example/ios', android: 'https://play.example/android'}

const renderGate = async () => {
  await render(
    <VersionGate>
      <Text>Library</Text>
    </VersionGate>
  )
  await act(async () => {})
}

afterEach(() => mockQuery.mockReset())

describe('isBelowMinimum', () => {
  it.each([
    ['1.2.0', '1.3.0', true],
    ['1.2.9', '1.10.0', true],
    ['0.9.9', '1.0.0', true],
    ['1.2.0', '1.2.0', false],
    ['1.3.0', '1.2.9', false],
    ['1.2.0', '0.0.0', false],
    ['1.2.0', null, false],
    [null, '9.9.9', false],
    ['garbage', '1.0.0', false],
  ])('%s below %s: %s', (installed, minimum, expected) => {
    expect(isBelowMinimum(installed, minimum)).toBe(expected)
  })
})

describe('VersionGate', () => {
  it('shows the update screen with the store link when the installed version is below the minimum', async () => {
    mockQuery.mockResolvedValue({minVersion: '1.3.0', storeUrl})
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await renderGate()
    expect(screen.queryByText('Library')).toBeNull()
    await fireEvent.press(screen.getByRole('button', {name: 'Update'}))
    expect(openURL).toHaveBeenCalledWith(Platform.OS === 'ios' ? storeUrl.ios : storeUrl.android)
  })

  it('runs the app when the installed version is at the minimum', async () => {
    mockQuery.mockResolvedValue({minVersion: '1.2.0', storeUrl})
    await renderGate()
    expect(screen.getByText('Library')).toBeTruthy()
  })

  it('runs the app while the check is loading', async () => {
    mockQuery.mockReturnValue(new Promise(() => {}))
    await renderGate()
    expect(screen.getByText('Library')).toBeTruthy()
  })

  it('runs the app when the check fails', async () => {
    mockQuery.mockRejectedValue(new Error('offline'))
    await renderGate()
    expect(screen.getByText('Library')).toBeTruthy()
  })

  it('checks again when the app returns to the foreground', async () => {
    mockQuery.mockResolvedValue({minVersion: null, storeUrl})
    const listen = jest.spyOn(AppState, 'addEventListener')
    await renderGate()
    mockQuery.mockResolvedValue({minVersion: '2.0.0', storeUrl})
    await act(async () => listen.mock.calls.at(-1)?.[1]('active'))
    expect(screen.queryByText('Library')).toBeNull()
    expect(screen.getByText('Update WhoCards')).toBeTruthy()
  })
})
