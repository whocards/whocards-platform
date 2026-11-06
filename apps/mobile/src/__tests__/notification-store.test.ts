jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-notifications', () => ({
  AndroidImportance: {DEFAULT: 3},
  PermissionStatus: {GRANTED: 'granted', UNDETERMINED: 'undetermined'},
  SchedulableTriggerInputTypes: {DATE: 'date'},
  addNotificationResponseReceivedListener: jest.fn(() => ({remove: jest.fn()})),
  getLastNotificationResponse: jest.fn(() => null),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}))
jest.mock('@whocards/observability', () => ({trackEvent: jest.fn()}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import {Alert, Linking, Platform} from 'react-native'
import type {AlertButton} from 'react-native'
import {pool, questionOfTheDay} from '@whocards/decks'
import {trackEvent} from '@whocards/observability'

import {
  ANDROID_CHANNEL_ID,
  ASK_DELAY_MS,
  askAfterLaunch,
  DAILY_HOUR,
  listenForPromptTaps,
  notePromptShown,
  openNotificationSetting,
  PROMPT_SOURCE,
  recordOpenAndMaybeAsk,
  refillDailyQuestions,
  WINDOW_DAYS,
} from '../lib/notification-store'
import {setStoredLanguage} from '../lib/language-store'

const getPermissions = jest.mocked(Notifications.getPermissionsAsync)
const requestPermissions = jest.mocked(Notifications.requestPermissionsAsync)
const setChannel = jest.mocked(Notifications.setNotificationChannelAsync)
const schedule = jest.mocked(Notifications.scheduleNotificationAsync)
const cancelAll = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync)
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue()
const addResponseListener = jest.mocked(Notifications.addNotificationResponseReceivedListener)
const getLastResponse = jest.mocked(Notifications.getLastNotificationResponse)

const permission = (status: string, canAskAgain = true) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the two fields the store reads.
  ({status, canAskAgain}) as unknown as Notifications.NotificationPermissionsStatus

const scheduled = () =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the store only schedules DATE triggers.
  schedule.mock.calls.map(([request]) => request.trigger as {date: Date; channelId: string})

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

describe('openNotificationSetting', () => {
  it('asks the OS when it never has, since iOS lists no switch until then', async () => {
    await openNotificationSetting()
    expect(requestPermissions).toHaveBeenCalledTimes(1)
    expect(openSettings).not.toHaveBeenCalled()
  })

  it('opens the OS setting once the OS has decided', async () => {
    getPermissions.mockResolvedValue(permission('denied', false))
    await openNotificationSetting()
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('opens the OS setting when already granted', async () => {
    getPermissions.mockResolvedValue(permission('granted'))
    await openNotificationSetting()
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(requestPermissions).not.toHaveBeenCalled()
  })
})

describe('refillDailyQuestions', () => {
  it('schedules nothing until the OS grants notifications', async () => {
    await refillDailyQuestions()
    expect(cancelAll).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('replaces the window with one Question of the Day per local day at 18:00', async () => {
    getPermissions.mockResolvedValue(permission('granted'))
    await refillDailyQuestions(new Date(2026, 10, 4, 12))

    expect(cancelAll.mock.invocationCallOrder[0]).toBeLessThan(
      schedule.mock.invocationCallOrder[0] ?? 0
    )
    expect(schedule).toHaveBeenCalledTimes(WINDOW_DAYS)
    expect(scheduled()[0]).toEqual({
      type: 'date',
      date: new Date(2026, 10, 4, DAILY_HOUR),
      channelId: ANDROID_CHANNEL_ID,
    })
    expect(scheduled()[1]?.date).toEqual(new Date(2026, 10, 5, DAILY_HOUR))
    expect(schedule.mock.calls[0]?.[0].content.body).toBe(pool[questionOfTheDay('2026-11-04')]?.en)
    expect(schedule.mock.calls[0]?.[0].content.data).toEqual({
      url: `mobile://play/library?q=${questionOfTheDay('2026-11-04')}&lang=en`,
      source: PROMPT_SOURCE,
    })
    expect(trackEvent).toHaveBeenCalledWith('prompt_scheduled', {count: WINDOW_DAYS})
  })

  it("starts tomorrow once today's 18:00 has passed, keeping the window full", async () => {
    getPermissions.mockResolvedValue(permission('granted'))
    await refillDailyQuestions(new Date(2026, 10, 4, DAILY_HOUR, 1))
    expect(schedule).toHaveBeenCalledTimes(WINDOW_DAYS)
    expect(scheduled()[0]?.date).toEqual(new Date(2026, 10, 5, DAILY_HOUR))
  })

  it('stays within the iOS cap of 64 pending notifications', () => {
    expect(WINDOW_DAYS).toBeLessThanOrEqual(64)
  })

  it('writes the question in the Library deck language', async () => {
    getPermissions.mockResolvedValue(permission('granted'))
    await setStoredLanguage('library', 'he')
    await refillDailyQuestions(new Date(2026, 10, 4, 12))
    expect(schedule.mock.calls[0]?.[0].content.body).toBe(pool[questionOfTheDay('2026-11-04')]?.he)
  })

  it('schedules right after the OS grants on "Yes"', async () => {
    requestPermissions.mockImplementationOnce(async () => {
      getPermissions.mockResolvedValue(permission('granted'))
      return permission('granted')
    })
    await recordOpenAndMaybeAsk()
    await recordOpenAndMaybeAsk()
    await pressAlertButton('Yes')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(schedule).toHaveBeenCalledTimes(WINDOW_DAYS)
  })
})

const response = (identifier: string, data: Record<string, unknown>) => {
  const fields = {notification: {request: {identifier, content: {data}}}}
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the fields the tap handler reads.
  return fields as unknown as Notifications.NotificationResponse
}
const prompt = (identifier: string, q: string) =>
  response(identifier, {url: `mobile://play/library?q=${q}&lang=he`, source: PROMPT_SOURCE})

describe('tapping a Question of the Day', () => {
  it('opens the player on the tapped Question from cold start, once', () => {
    getLastResponse.mockReturnValueOnce(prompt('cold', '7'))
    listenForPromptTaps()
    // The same launch tap can also reach the listener.
    addResponseListener.mock.calls[0]?.[0](prompt('cold', '7'))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith('mobile://play/library?q=7&lang=he')
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('prompt_opened', {question_id: '7', language: 'he'})
  })

  it('opens the player on the tapped Question from the background', () => {
    const stop = listenForPromptTaps()
    expect(openURL).not.toHaveBeenCalled()
    addResponseListener.mock.calls[0]?.[0](prompt('warm', '12'))

    expect(openURL).toHaveBeenCalledWith('mobile://play/library?q=12&lang=he')
    expect(trackEvent).toHaveBeenCalledWith('prompt_opened', {question_id: '12', language: 'he'})
    stop()
    expect(addResponseListener.mock.results[0]?.value.remove).toHaveBeenCalled()
  })

  it('ignores a notification that is not a Question of the Day', () => {
    listenForPromptTaps()
    addResponseListener.mock.calls[0]?.[0](response('other', {url: 'mobile://play/library?q=3'}))
    expect(openURL).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('reports prompt_played once, when the player shows the tapped Question', () => {
    listenForPromptTaps()
    addResponseListener.mock.calls[0]?.[0](prompt('played', '21'))
    jest.mocked(trackEvent).mockClear()

    notePromptShown({deck_id: 'library', question_id: '20', language: 'he'})
    expect(trackEvent).not.toHaveBeenCalled()
    notePromptShown({deck_id: 'library', question_id: '21', language: 'he'})
    notePromptShown({deck_id: 'library', question_id: '21', language: 'he'})
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('prompt_played', {
      deck_id: 'library',
      question_id: '21',
      language: 'he',
    })
  })
})
