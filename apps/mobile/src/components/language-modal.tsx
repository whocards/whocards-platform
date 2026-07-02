import {Ionicons} from '@expo/vector-icons'
import {StatusBar} from 'expo-status-bar'
import {Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {getLanguageName} from '@whocards/decks'
import {colors} from '@whocards/tokens'

import {MAX_SECONDARY_LANGUAGES} from '@/lib/language-constants'

type LanguageModalProps = {
  visible: boolean
  languages: string[]
  current: string
  /** Secondary display languages shown under the primary on the card (max 2). */
  secondary?: string[]
  onSelect: (language: string) => void
  onSecondaryChange?: (languages: string[]) => void
  onClose: () => void
}

/**
 * Native language picker — the OS sheet (`presentationStyle="pageSheet"`): an iOS
 * card sheet with swipe-to-dismiss, a full native modal on Android. Mirrors the
 * web's "Choose your language" modal. `onDismiss` keeps `visible` in sync when the
 * sheet is swiped away.
 *
 * Two sections: the primary language (single choice — drives sharing, deep links,
 * layout direction) and "Also show" (a Display setting: up to two extra languages
 * rendered under the primary on the card). The primary never appears in "Also show".
 *
 * Status bar is set to dark (dark icons) while this white sheet is open so the
 * system icons remain visible. The root layout's light bar is restored on close.
 */
export const LanguageModal = ({
  visible,
  languages,
  current,
  secondary = [],
  onSelect,
  onSecondaryChange,
  onClose,
}: LanguageModalProps) => {
  const insets = useSafeAreaInsets()
  const showSecondary = onSecondaryChange !== undefined && languages.length > 1

  const toggleSecondary = (code: string) => {
    if (!onSecondaryChange) return
    if (secondary.includes(code)) {
      onSecondaryChange(secondary.filter((entry) => entry !== code))
      return
    }
    if (secondary.length >= MAX_SECONDARY_LANGUAGES) return
    onSecondaryChange([...secondary, code])
  }

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

          {showSecondary ? (
            <>
              <View className="border-gray-lighter mt-2 border-t px-5 pb-1 pt-5">
                <Text className="text-darker font-title text-lg">Also show</Text>
                <Text className="text-gray-dark font-sans text-sm">
                  Show the question in up to {MAX_SECONDARY_LANGUAGES} more languages.
                </Text>
              </View>
              {languages
                .filter((code) => code !== current)
                .map((code) => {
                  const checked = secondary.includes(code)
                  const disabled = !checked && secondary.length >= MAX_SECONDARY_LANGUAGES
                  return (
                    <Pressable
                      key={`secondary-${code}`}
                      onPress={() => toggleSecondary(code)}
                      disabled={disabled}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked, disabled}}
                      className={`flex-row items-center justify-between px-5 py-3 ${
                        checked ? 'bg-yellow-300/40' : ''
                      }`}
                    >
                      <Text
                        className={`font-sans text-lg ${
                          disabled ? 'text-gray-dark' : 'text-darker'
                        }`}
                      >
                        {getLanguageName(code) ?? code}
                      </Text>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={checked ? colors.primary.dark : colors.gray.dark}
                      />
                    </Pressable>
                  )
                })}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}
