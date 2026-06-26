/**
 * App launch configuration.
 *
 * Two independent flags gate the public /app funnel:
 *   - PUBLIC_APP_WAITLIST_ENABLED exposes the pre-launch waitlist funnel.
 *   - PUBLIC_APP_LAUNCHED flips /app from waitlist mode to download mode.
 * Both default to false, which hides /app (redirects home) and removes its
 * nav/homepage entry points while the email/consent backend ships.
 *
 * Store URLs point at the real listings (iOS App Store id + Android package).
 * The guard below throws at module load if a placeholder ever slips back in
 * while APP_LAUNCHED is true, so a broken CTA can never reach a launched funnel.
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

/** App Store product URL — keyed off the numeric App Store id (slug is cosmetic). */
export const APP_STORE_URL = `https://apps.apple.com/app/whocards/id${APP_STORE_APP_ID}?utm_source=website&utm_medium=app_page&utm_campaign=launch`

/** Google Play store URL — keyed off the Android application id. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.whocards.mobile&utm_source=website&utm_medium=app_page&utm_campaign=launch'

// Defence-in-depth: a launched funnel must never serve a placeholder store link.
// This fires at module load (SSR) so a stray `TODO` can't slip past review and
// reach visitors once PUBLIC_APP_LAUNCHED is flipped.
if (APP_LAUNCHED && (APP_STORE_URL.includes('TODO') || PLAY_STORE_URL.includes('TODO'))) {
  throw new Error(
    'App is launched (PUBLIC_APP_LAUNCHED=true) but a store URL still contains a TODO placeholder. ' +
      'Set the real App Store id / Android package in src/constants/app.ts before launch.'
  )
}
