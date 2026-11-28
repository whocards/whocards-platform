import AsyncStorage from '@react-native-async-storage/async-storage'

/** The name last sent with an ask (Share's "Ask someone"), offered again next time. Per Device, never synced. */
const STORAGE_KEY = 'whocards-asker-name'

export const getStoredAskerName = async (): Promise<string> =>
  (await AsyncStorage.getItem(STORAGE_KEY).catch(() => null)) ?? ''

export const setStoredAskerName = (name: string): Promise<void> =>
  AsyncStorage.setItem(STORAGE_KEY, name.trim())
