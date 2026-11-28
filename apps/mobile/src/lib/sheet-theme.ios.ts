import type {BottomSheetProps} from '@expo/ui'
import {preferredColorScheme} from '@expo/ui/swift-ui/modifiers'

/** Makes a native sheet follow the app's Theme, which the OS never hears about (color-scheme.ts). */
export const sheetTheme = (isDark: boolean): Pick<BottomSheetProps, 'modifiers'> => ({
  modifiers: [preferredColorScheme(isDark ? 'dark' : 'light')],
})

/** The grabber floats over the content and the sheet keeps clear of the home indicator itself. */
export const SHEET_PADDING = {top: 'pt-6', bottom: ''}
