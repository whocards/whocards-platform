/**
 * App launch configuration.
 *
 * Set PUBLIC_APP_LAUNCHED=true in the environment to flip /app from waitlist
 * mode to download mode. Store URLs are placeholders until the apps are live —
 * replace the TODO values with real store IDs before launch.
 */
import {env} from '~env'

/** True once the app is publicly released. Flip via PUBLIC_APP_LAUNCHED env var. */
export const APP_LAUNCHED: boolean = env.PUBLIC_APP_LAUNCHED

/**
 * App Store numeric ID (App Store Connect `ascAppId`) for the iOS Smart App Banner.
 * Only surfaced when APP_LAUNCHED is true (#90).
 */
export const APP_STORE_APP_ID = '6782853824'

/** TODO: replace with real App Store product URL once the iOS app is live. */
export const APP_STORE_URL =
  'https://apps.apple.com/app/whocards/idTODO?utm_source=website&utm_medium=app_page&utm_campaign=launch'

/** TODO: replace with real Google Play store URL once the Android app is live. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=cc.whocards.appTODO&utm_source=website&utm_medium=app_page&utm_campaign=launch'
