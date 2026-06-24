import {Ionicons} from '@expo/vector-icons'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

type LanguageModalProps = {
  visible: boolean
  languages: string[]
  current: string
  onSelect: (language: string) => void
  onClose: () => void
}

/**
 * Native language picker — the OS sheet (`presentationStyle="pageSheet"`): an iOS
 * card sheet with swipe-to-dismiss, a full native modal on Android. Mirrors the
 * web's "Choose your language" modal. `onDismiss` keeps `visible` in sync when the
 * sheet is swiped away.
 *
 * Status bar is set to dark (dark icons) while this white sheet is open so the
 * system icons remain visible. The root layout's light bar is restored on close.
 */
export const LanguageModal = ({
  visible,
  languages,
  current,
  onSelect,
  onClose,
}: LanguageModalProps) => {
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      {/* Dark status-bar icons are legible over this white sheet. */}
      <StatusBar style="dark" />
      <View className="flex-1 bg-white">
        {/* On Android, pageSheet renders behind the status bar, so push the header
            below the display cutout. On iOS the card sheet already insets itself. */}
        <View
          className="border-gray-lighter flex-row items-center justify-between border-b px-5 py-4"
          style={{paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 16}}
        >
          <Text className="text-darker font-title text-2xl">Choose your language</Text>
          <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.darker} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{paddingBottom: Math.max(insets.bottom, 24)}}>
          {languages.map((code) => {
            const selected = code === current
            return (
              <Pressable
                key={code}
                onPress={() => onSelect(code)}
                className={`flex-row items-center justify-between px-5 py-4 ${
                  selected ? 'bg-yellow-300/40' : ''
                }`}
              >
                <Text className="text-darker font-sans text-lg">
                  {getLanguageName(code) ?? code}
                </Text>
                {selected ? <Text className="text-primary-dark text-lg font-bold">✓</Text> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}
