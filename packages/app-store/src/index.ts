/**
 * Single source of truth for the WhoCards store listings.
 *
 * The iOS App Store id and Android package are each hardcoded exactly once, here.
 * Everything that needs a store URL — the website CTA, the iOS Smart App Banner
 * meta tag, and the launch-blast email — builds it from `buildAppStoreUrl` /
 * `buildPlayStoreUrl` so a change to the id/package (or the UTM shape) only has
 * to happen in one place. See issue #128.
 */

/** App Store Connect numeric id (`ascAppId`) for the WhoCards iOS listing. */
export const APP_STORE_APP_ID = '6782853824'

/** Android application id for the WhoCards Google Play listing. */
export const ANDROID_PACKAGE_ID = 'com.whocards.mobile'

/** UTM parameters every store link is tagged with, so campaign attribution stays consistent. */
export type StoreLinkUtm = Readonly<{
  /** Where the click originated, e.g. `website`, `email`. */
  source: string
  /** The surface within that source, e.g. `app_page`, `launch_blast`. */
  medium: string
  /** The campaign this link belongs to. Defaults to `launch`. */
  campaign?: string
}>

function withUtm(url: string, utm: StoreLinkUtm): string {
  const parsed = new URL(url)
  parsed.searchParams.set('utm_source', utm.source)
  parsed.searchParams.set('utm_medium', utm.medium)
  parsed.searchParams.set('utm_campaign', utm.campaign ?? 'launch')
  return parsed.toString()
}

/** Builds the UTM-tagged iOS App Store product URL for the WhoCards listing. */
export function buildAppStoreUrl(utm: StoreLinkUtm): string {
  return withUtm(`https://apps.apple.com/app/whocards/id${APP_STORE_APP_ID}`, utm)
}

/** Builds the UTM-tagged Google Play store URL for the WhoCards listing. */
export function buildPlayStoreUrl(utm: StoreLinkUtm): string {
  return withUtm(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`, utm)
}
