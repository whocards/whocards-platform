import {Platform} from 'react-native'

/** The wordmark width the native splash draws, per platform: app.json's expo-splash-screen `imageWidth`. */
export const SPLASH_LOGO_WIDTH = {ios: 280, android: 180}

/** This platform's splash wordmark width, where the landing logo starts before it grows into place. */
export const splashLogoWidth =
  Platform.OS === 'android' ? SPLASH_LOGO_WIDTH.android : SPLASH_LOGO_WIDTH.ios
