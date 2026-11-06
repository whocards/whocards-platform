import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import {Alert, Linking, Platform} from 'react-native'
import {
  DEFAULT_DECK_SLUG,
  DEFAULT_LANGUAGE,
  isLanguageCode,
  pool,
  questionOfTheDay,
} from '@whocards/decks'
import {EVENTS, track} from '@whocards/observability/events'
import type {
  PromptOpenedProps,
  PromptPlayedProps,
  PromptScheduledProps,
} from '@whocards/observability/events'

import {getStoredLanguage} from './language-store'
import {parsePlayLink} from './play-link'

const KEY_OPEN_COUNT = 'whocards-notifications:open-count'
const KEY_ASKED = 'whocards-notifications:asked'
const KEY_DAILY_OFF = 'whocards-notifications:daily-off'
const KEY_DAILY_HOUR = 'whocards-notifications:daily-hour'

/** App opens before the ask: never on a fresh install, once on the second open (issue #361). */
export const ASK_ON_OPEN = 2

/** Past the splash (fallback 1500 ms) and the 900 ms first-card entrance; iOS can drop an alert raised earlier. */
export const ASK_DELAY_MS = 2000

export const ANDROID_CHANNEL_ID = 'daily-question'

/** Default local hour the Question of the Day arrives. */
export const DAILY_HOUR = 18

/** Days scheduled ahead; iOS keeps at most 64 pending local notifications. */
export const WINDOW_DAYS = 60

/** Marks a scheduled notification's `data` as a Question of the Day. */
export const PROMPT_SOURCE = 'question_of_the_day'

const createChannel = async () => {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Daily question',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

const localDateKey = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')

export type DailySetting = {enabled: boolean; hour: number}

export const getDailySetting = async (): Promise<DailySetting> => {
  const [off, stored] = await Promise.all([
    AsyncStorage.getItem(KEY_DAILY_OFF),
    AsyncStorage.getItem(KEY_DAILY_HOUR),
  ])
  const hour = Number(stored ?? DAILY_HOUR)
  return {
    enabled: !off,
    hour: Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : DAILY_HOUR,
  }
}

/** Saves the setting and reschedules at once; off cancels every scheduled prompt. */
export const setDailySetting = async ({enabled, hour}: DailySetting): Promise<void> => {
  await (enabled
    ? AsyncStorage.removeItem(KEY_DAILY_OFF)
    : AsyncStorage.setItem(KEY_DAILY_OFF, '1'))
  await AsyncStorage.setItem(KEY_DAILY_HOUR, String(hour))
  await refillDailyQuestions()
}

export const notificationsAllowed = async (): Promise<boolean> =>
  (await Notifications.getPermissionsAsync()).status === Notifications.PermissionStatus.GRANTED

const refill = async (now = new Date()): Promise<void> => {
  const {enabled, hour} = await getDailySetting()
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync()
    return
  }
  if (!(await notificationsAllowed())) return

  const stored = await getStoredLanguage(DEFAULT_DECK_SLUG)
  const language = stored && isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE
  // Android below 13 grants without a prompt, so the channel may not exist yet.
  await createChannel()
  await Notifications.cancelAllScheduledNotificationsAsync()

  let count = 0
  for (let day = 0; count < WINDOW_DAYS; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour)
    if (date <= now) continue
    const id = questionOfTheDay(localDateKey(date))
    await Notifications.scheduleNotificationAsync({
      content: {
        body: pool[id]?.[language],
        data: {
          url: `mobile://play/${DEFAULT_DECK_SLUG}?q=${id}&lang=${language}`,
          source: PROMPT_SOURCE,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: ANDROID_CHANNEL_ID,
      },
    })
    count++
  }
  track({name: EVENTS.PROMPT_SCHEDULED, props: {count} satisfies PromptScheduledProps})
}

// Serialized: a quick off-then-on would otherwise interleave a cancel with another run's scheduling.
let refilling: Promise<void> = Promise.resolve()

/** Replaces the scheduled window with one Question of the Day per local day at the chosen hour, once the OS allows notifications. */
export const refillDailyQuestions = (now?: Date): Promise<void> => {
  const run = refilling.catch(() => {}).then(() => refill(now))
  refilling = run
  return run
}

const requestPermission = async () => {
  // Android 13+ only shows the POST_NOTIFICATIONS prompt once a channel exists.
  await createChannel()
  await Notifications.requestPermissionsAsync()
  await refillDailyQuestions()
}

// "Not now" is final: the app never asks again; Settings opens the OS setting instead.
export const recordOpenAndMaybeAsk = async (): Promise<void> => {
  if (await AsyncStorage.getItem(KEY_ASKED)) return
  const count = Number(await AsyncStorage.getItem(KEY_OPEN_COUNT)) + 1
  await AsyncStorage.setItem(KEY_OPEN_COUNT, String(count))
  if (count < ASK_ON_OPEN) return

  // Persist before asking so a crash or a kill mid-prompt can't ask twice.
  await AsyncStorage.setItem(KEY_ASKED, '1')
  const {status, canAskAgain} = await Notifications.getPermissionsAsync()
  if (status === Notifications.PermissionStatus.GRANTED || !canAskAgain) return

  Alert.alert('Get a daily question?', undefined, [
    {text: 'Not now', style: 'cancel'},
    {text: 'Yes', onPress: () => void requestPermission().catch(() => {})},
  ])
}

/** Runs the ask once launch has settled; returns the cancel for an unmount. */
export const askAfterLaunch = (): (() => void) => {
  // Best-effort: a failed permission check must never break launch.
  const timer = setTimeout(() => void recordOpenAndMaybeAsk().catch(() => {}), ASK_DELAY_MS)
  return () => clearTimeout(timer)
}

// iOS lists no Notifications switch for an app it never asked, so ask instead of opening a dead end.
export const openNotificationSetting = async (): Promise<void> => {
  const {status, canAskAgain} = await Notifications.getPermissionsAsync()
  if (status === Notifications.PermissionStatus.UNDETERMINED && canAskAgain) {
    await requestPermission()
  } else {
    await Linking.openSettings()
  }
}

// The tapped Question waiting for the player to show it; prompt_played fires once, then clears it.
let pendingPrompt: string | null = null
let lastResponseId: string | null = null

const openPrompt = (response: Notifications.NotificationResponse) => {
  const {identifier, content} = response.notification.request
  // A cold-start tap can reach both the listener and the launch check.
  if (identifier === lastResponseId) return
  const {url, source} = content.data ?? {}
  if (source !== PROMPT_SOURCE || typeof url !== 'string') return
  const link = parsePlayLink(url)
  if (!link?.q) return
  lastResponseId = identifier
  pendingPrompt = link.q
  track({
    name: EVENTS.PROMPT_OPENED,
    props: {
      question_id: link.q,
      language: link.lang ?? DEFAULT_LANGUAGE,
    } satisfies PromptOpenedProps,
  })
  // openURL, not router.navigate: the player's `url` listener moves the Card when the deck is already open.
  void Linking.openURL(url)
}

/** Opens the player on a tapped Question of the Day, from cold start or the background; returns the cleanup. */
export const listenForPromptTaps = (): (() => void) => {
  const sub = Notifications.addNotificationResponseReceivedListener(openPrompt)
  const launch = Notifications.getLastNotificationResponse()
  if (launch) openPrompt(launch)
  return () => sub.remove()
}

/** Called as the player shows a Question: reports prompt_played when it is the tapped one. */
export const notePromptShown = (props: PromptPlayedProps): void => {
  if (props.question_id !== pendingPrompt || props.deck_id !== DEFAULT_DECK_SLUG) return
  pendingPrompt = null
  track({name: EVENTS.PROMPT_PLAYED, props})
}
