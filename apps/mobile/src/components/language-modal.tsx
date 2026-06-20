import {Ionicons} from '@expo/vector-icons'
import {StatusBar} from 'expo-status-bar'
import {Modal, Pressable, ScrollView, Text, View} from 'react-native'
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
}: LanguageModalProps) => (
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
      <View className="border-gray-lighter flex-row items-center justify-between border-b px-5 py-4">
        <Text className="text-darker font-title text-2xl">Choose your language</Text>
        <Pressable onPress={onClose} accessibilityLabel="close" hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.darker} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: 24}}>
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
              <Text className="text-darker font-sans text-lg">{getLanguageName(code) ?? code}</Text>
              {selected ? <Text className="text-primary-dark text-lg font-bold">✓</Text> : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  </Modal>
)
