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
 *
 * The store id/package are defined once, in `@whocards/app-store` — the single
 * source of truth also consumed by the launch-blast email (#128).
 */
import {APP_STORE_APP_ID, buildAppStoreUrl, buildPlayStoreUrl} from '@whocards/app-store'
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
 * Only surfaced when APP_IOS_LAUNCHED is true (#90). Re-exported from
 * `@whocards/app-store` so existing imports of this module keep working.
 */
export {APP_STORE_APP_ID}

/** UTM-tagged store links; `medium` names the surface the link sits on. */
export const appStoreUrl = (medium: string): string =>
  buildAppStoreUrl({source: 'website', medium, campaign: 'app'})

export const playStoreUrl = (medium: string): string =>
  buildPlayStoreUrl({source: 'website', medium, campaign: 'app'})
