import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import {Alert, Linking, Platform} from 'react-native'

const KEY_OPEN_COUNT = 'whocards-notifications:open-count'
const KEY_ASKED = 'whocards-notifications:asked'

/** App opens before the ask: never on a fresh install, once on the second open (issue #361). */
export const ASK_ON_OPEN = 2

/** Past the splash (fallback 1500 ms) and the 900 ms first-card entrance; iOS can drop an alert raised earlier. */
export const ASK_DELAY_MS = 2000

export const ANDROID_CHANNEL_ID = 'daily-question'

const requestPermission = async () => {
  // Android 13+ only shows the POST_NOTIFICATIONS prompt once a channel exists.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Daily question',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }
  await Notifications.requestPermissionsAsync()
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
