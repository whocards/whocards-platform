/**
 * App launch configuration.
 *
 * Two independent flags gate the public /app funnel:
 *   - PUBLIC_APP_WAITLIST_ENABLED exposes the pre-launch waitlist funnel.
 *   - PUBLIC_APP_LAUNCHED flips /app from waitlist mode to download mode.
 * Both default to false, which hides /app (redirects home) and removes its
 * nav/homepage entry points while the email/consent backend ships.
 *
 * Store URLs are placeholders until the apps are live — replace the TODO values
 * with real store IDs before launch.
 */
import {env} from '~env'

import {computeAppVisible} from './app-visibility'

/** True once the app is publicly released. Flip via PUBLIC_APP_LAUNCHED env var. */
export const APP_LAUNCHED: boolean = env.PUBLIC_APP_LAUNCHED

/**
 * True while the pre-launch waitlist funnel is exposed. Flip via the
 * PUBLIC_APP_WAITLIST_ENABLED env var. Has no effect once the app is launched.
 */
export const APP_WAITLIST_ENABLED: boolean = env.PUBLIC_APP_WAITLIST_ENABLED

/**
 * Whether the public /app funnel is reachable at all. Gates the nav/homepage
 * entry points and the /app route itself (which redirects home when hidden).
 * Safe default: false — both flags off keeps /app hidden. Launch mode is always
 * visible; waitlist mode is opt-in via PUBLIC_APP_WAITLIST_ENABLED.
 */
export const APP_VISIBLE: boolean = computeAppVisible(APP_LAUNCHED, APP_WAITLIST_ENABLED)

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
