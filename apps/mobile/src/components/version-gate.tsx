import * as Application from 'expo-application'
import {StatusBar} from 'expo-status-bar'
import type {ReactNode} from 'react'
import {useEffect, useState} from 'react'
import {AppState, Linking, Platform, Text, View} from 'react-native'
import type {RouterOutputs} from '@whocards/api'

import {PressableScale} from '@/components/pressable-scale'
import {ScreenBackground} from '@/components/screen-background'
import {useIsDark} from '@/lib/color-scheme'
import {useT} from '@/lib/i18n'
import {trpc} from '@/lib/trpc'
import {isBelowMinimum} from '@/lib/version'

type Compatibility = RouterOutputs['mobile']['compatibility']

/** Blocks a build below the server's minimum version with an update screen; loading or a failed check lets the app run. */
export const VersionGate = ({children}: {children: ReactNode}) => {
  const [compatibility, setCompatibility] = useState<Compatibility | null>(null)

  useEffect(() => {
    let latest = 0
    const check = () => {
      const id = ++latest
      // A slower, older check must not overwrite a newer result.
      const settle = (result: Compatibility | null) => id === latest && setCompatibility(result)
      return trpc.mobile.compatibility.query().then(settle, () => settle(null))
    }
    void check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check()
    })
    return () => sub.remove()
  }, [])

  if (!compatibility) return children
  if (!isBelowMinimum(Application.nativeApplicationVersion, compatibility.minVersion)) {
    return children
  }
  const {storeUrl} = compatibility
  return <UpdateScreen storeUrl={Platform.OS === 'ios' ? storeUrl.ios : storeUrl.android} />
}

const UpdateScreen = ({storeUrl}: {storeUrl: string}) => {
  const isDark = useIsDark()
  const t = useT()
  return (
    <ScreenBackground>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <Text className="text-darker dark:text-white text-center font-sans text-2xl font-bold">
          {t('update.title')}
        </Text>
        <Text className="text-mutedOnLight dark:text-gray-dark mb-4 text-center font-sans text-base">
          {t('update.body')}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('update.button')}
          onPress={() => void Linking.openURL(storeUrl)}
          className="active:bg-yellow-500 w-full items-center justify-center rounded-full bg-yellow-400 py-4"
        >
          <Text className="text-darker font-sans text-base font-bold">{t('update.button')}</Text>
        </PressableScale>
      </View>
    </ScreenBackground>
  )
}
