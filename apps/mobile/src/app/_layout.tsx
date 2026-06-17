import {Stack} from 'expo-router'
import {StatusBar} from 'expo-status-bar'
import {GestureHandlerRootView} from 'react-native-gesture-handler'
import {colors} from '@whocards/tokens'

import '../global.css'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.darkest}}}
      />
    </GestureHandlerRootView>
  )
}
