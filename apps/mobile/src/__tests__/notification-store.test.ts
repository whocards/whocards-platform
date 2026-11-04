jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-notifications', () => ({
  AndroidImportance: {DEFAULT: 3},
  PermissionStatus: {GRANTED: 'granted'},
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import {Alert, Platform} from 'react-native'
import type {AlertButton} from 'react-native'

import {
  ANDROID_CHANNEL_ID,
  ASK_DELAY_MS,
  askAfterLaunch,
  recordOpenAndMaybeAsk,
} from '../lib/notification-store'

const getPermissions = jest.mocked(Notifications.getPermissionsAsync)
const requestPermissions = jest.mocked(Notifications.requestPermissionsAsync)
const setChannel = jest.mocked(Notifications.setNotificationChannelAsync)
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})

const permission = (status: string, canAskAgain = true) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the two fields the store reads.
  ({status, canAskAgain}) as unknown as Notifications.NotificationPermissionsStatus

const pressAlertButton = async (text: string) => {
  const buttons: AlertButton[] = alert.mock.calls[0]?.[2] ?? []
  buttons.find((button) => button.text === text)?.onPress?.()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
  getPermissions.mockResolvedValue(permission('undetermined'))
})

describe('notification permission ask', () => {
  it('does not prompt on the first app open', async () => {
    await recordOpenAndMaybeAsk()
    expect(alert).not.toHaveBeenCalled()
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('asks "Get a daily question?" on the second app open, and only once', async () => {
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0]?.[0]).toBe('Get a daily question?')

    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    expect(alert).toHaveBeenCalledTimes(1)
  })

  it('respects "Not now": no OS request, never asked again', async () => {
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    await pressAlertButton('Not now')
    await recordOpenAndMaybeAsk()

    expect(requestPermissions).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledTimes(1)
  })

  it('requests the OS permission on "Yes", creating the Android channel first', async () => {
    const os = Platform.OS
    Platform.OS = 'android'
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    await pressAlertButton('Yes')
    Platform.OS = os

    expect(setChannel).toHaveBeenCalledWith(ANDROID_CHANNEL_ID, expect.anything())
    expect(requestPermissions).toHaveBeenCalledTimes(1)
    expect(setChannel.mock.invocationCallOrder[0]).toBeLessThan(
      requestPermissions.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('skips the prompt when the OS already granted or blocks asking', async () => {
    getPermissions.mockResolvedValue(permission('denied', false))
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    expect(alert).not.toHaveBeenCalled()
  })

  it('stops counting opens once it has asked', async () => {
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    expect(await AsyncStorage.getItem('whocards-notifications:open-count')).toBe('2')
  })

  it('swallows a failed OS request after "Yes"', async () => {
    requestPermissions.mockRejectedValueOnce(new Error('denied by OS'))
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    await pressAlertButton('Yes')
    expect(requestPermissions).toHaveBeenCalledTimes(1)
  })
})

describe('askAfterLaunch', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('waits past the splash and entrance before counting the open', async () => {
    askAfterLaunch()
    await jest.advanceTimersByTimeAsync(ASK_DELAY_MS - 1)
    expect(await AsyncStorage.getItem('whocards-notifications:open-count')).toBeNull()
    await jest.advanceTimersByTimeAsync(1)
    expect(await AsyncStorage.getItem('whocards-notifications:open-count')).toBe('1')
  })

  it('never asks once cancelled by an unmount', async () => {
    await recordOpenAndMaybeAsk()
    askAfterLaunch()()
    await jest.advanceTimersByTimeAsync(ASK_DELAY_MS)
    expect(alert).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem('whocards-notifications:open-count')).toBe('1')
  })
})
