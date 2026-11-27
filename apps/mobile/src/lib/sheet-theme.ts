import type {BottomSheetProps} from '@expo/ui'
import {colors} from '@whocards/tokens'

/** Makes a native sheet follow the app's Theme, which the OS never hears about (color-scheme.ts). */
export const sheetTheme = (isDark: boolean): Pick<BottomSheetProps, 'containerColor'> => ({
  containerColor: isDark ? colors.dark : colors.white,
})
