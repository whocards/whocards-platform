import {Ionicons} from '@expo/vector-icons'
import {useColorScheme} from 'nativewind'
import {Pressable, Text, View} from 'react-native'
import {colors} from '@whocards/tokens'

type SettingsSheetHeaderProps = {
  title: string
  /**
   * 'close' is the root menu page's own header (an "X" that dismisses the
   * whole sheet). 'back' is every pushed page's header (a `chevron-back`
   * that returns to the menu — see settings-modal.tsx's pager). The two read
   * differently on purpose: a root screen offers to leave, a pushed screen
   * offers to go back, matching the native nav-stack convention this mirrors.
   */
  icon: 'close' | 'back'
  onPress: () => void
}

/**
 * The header every page in SettingsModal's single-Modal pager renders atop
 * its own content (issue #189, third pass — the sheet used to be N separate
 * stacked Modals, one per page, each with its own copy of this exact header
 * markup; now there's one Modal with one shared header component). Each page
 * (menu, Game, Theme, Language) is a self-contained, full-width slide-in
 * unit — header included — rather than a floating chrome bar synchronized
 * separately from the sliding content, so this renders inside each page,
 * not once at the pager's root.
 *
 * `accessibilityLabel` mirrors the icon's purpose ("back"/"close") rather
 * than repeating the page title, matching every other icon-only Pressable in
 * this app (the close button this replaces used the same "close" label).
 */
export const SettingsSheetHeader = ({title, icon, onPress}: SettingsSheetHeaderProps) => {
  const {colorScheme} = useColorScheme()
  const isDark = colorScheme !== 'light'
  const iconColor = isDark ? colors.white : colors.darker

  return (
    <View
      className="border-gray-lighter dark:border-white/10 flex-row items-center justify-between border-b px-5 py-4"
      // On Android with statusBarTranslucent, the sheet can otherwise sit
      // under the status bar/notch on a device in the rare case its content
      // pushes the header above the safe area.
      style={{paddingTop: 16}}
    >
      {icon === 'back' ? (
        <View className="flex-row items-center gap-1">
          <Pressable onPress={onPress} accessibilityLabel="back" hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={iconColor} />
          </Pressable>
          <Text className="text-darker dark:text-white font-title text-2xl">{title}</Text>
        </View>
      ) : (
        <>
          <Text className="text-darker dark:text-white font-title text-2xl">{title}</Text>
          <Pressable onPress={onPress} accessibilityLabel="close" hitSlop={12}>
            <Ionicons name="close" size={24} color={iconColor} />
          </Pressable>
        </>
      )}
    </View>
  )
}
