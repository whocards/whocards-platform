/**
 * Pure visibility rule for the public /app funnel, kept free of any `env` import
 * so it can be unit-tested without the full environment.
 *
 * iOS and Android launch on separate timelines (iOS is public; Android trails by
 * Google's Closed Test), so the flags are per-store. The funnel (route, nav entry,
 * homepage CTA) is reachable as soon as either store is live:
 *
 *   PUBLIC_APP_IOS_LAUNCHED      — iOS App Store listing is live (default on)
 *   PUBLIC_APP_ANDROID_LAUNCHED  — Google Play listing is live (default off)
 *
 *   ios=false, android=false → hidden  (/app redirects home)
 *   ios=true  OR android=true → visible (download mode)
 */
export const computeAppVisible = (iosLaunched: boolean, androidLaunched: boolean): boolean =>
  iosLaunched || androidLaunched
