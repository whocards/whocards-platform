/**
 * App launch configuration.
 *
 * iOS and Android launch on separate timelines, so each store has its own flag:
 *   - PUBLIC_APP_IOS_LAUNCHED      iOS App Store listing is public (default true).
 *   - PUBLIC_APP_ANDROID_LAUNCHED  Google Play listing is public (default false —
 *     Android is still in Google's mandatory Closed Test).
 *
 * While Android is in testing, /app offers the real iOS download and routes
 * Android visitors to the /android-testers funnel instead of a Play badge.
 *
 * Store URLs point at the real listings (iOS App Store id + Android package).
 * The guard below throws at module load if a placeholder ever slips back in for a
 * platform that is marked launched, so a broken CTA can never reach a live funnel.
 */
import {env} from '~env'

import {computeAppVisible} from './app-visibility'

/** True once the iOS App Store listing is public. Flip via PUBLIC_APP_IOS_LAUNCHED. */
export const APP_IOS_LAUNCHED: boolean = env.PUBLIC_APP_IOS_LAUNCHED

/**
 * True once the Google Play listing is public. Flip via PUBLIC_APP_ANDROID_LAUNCHED
 * after Google grants production access. Until then Android visitors are sent to
 * the /android-testers Closed Test funnel.
 */
export const APP_ANDROID_LAUNCHED: boolean = env.PUBLIC_APP_ANDROID_LAUNCHED

/**
 * Whether the public /app funnel is reachable at all. Gates the nav/homepage
 * entry points and the /app route itself (which redirects home when hidden).
 * Visible whenever either store is live.
 */
export const APP_VISIBLE: boolean = computeAppVisible(APP_IOS_LAUNCHED, APP_ANDROID_LAUNCHED)

/**
 * App Store numeric ID (App Store Connect `ascAppId`) for the iOS Smart App Banner.
 * Only surfaced when APP_IOS_LAUNCHED is true (#90).
 */
export const APP_STORE_APP_ID = '6782853824'

/** App Store product URL — keyed off the numeric App Store id (slug is cosmetic). */
export const APP_STORE_URL = `https://apps.apple.com/app/whocards/id${APP_STORE_APP_ID}?utm_source=website&utm_medium=app_page&utm_campaign=launch`

/** Google Play store URL — keyed off the Android application id. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.whocards.mobile&utm_source=website&utm_medium=app_page&utm_campaign=launch'

// Defence-in-depth: a launched platform must never serve a placeholder store link.
// This fires at module load (SSR) so a stray `TODO` can't slip past review and
// reach visitors once a store flag is flipped on. Each platform is checked only
// when it is actually marked launched.
if (APP_IOS_LAUNCHED && APP_STORE_URL.includes('TODO')) {
  throw new Error(
    'iOS is launched (PUBLIC_APP_IOS_LAUNCHED=true) but the App Store URL still contains a TODO ' +
      'placeholder. Set the real App Store id in src/constants/app.ts before launch.'
  )
}
if (APP_ANDROID_LAUNCHED && PLAY_STORE_URL.includes('TODO')) {
  throw new Error(
    'Android is launched (PUBLIC_APP_ANDROID_LAUNCHED=true) but the Play Store URL still contains a ' +
      'TODO placeholder. Set the real Android package in src/constants/app.ts before launch.'
  )
}
