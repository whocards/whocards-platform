/**
 * Pure visibility rule for the public /app funnel, kept free of any `env` import
 * so it can be unit-tested without the full environment.
 *
 * Truth table (see PUBLIC_APP_LAUNCHED / PUBLIC_APP_WAITLIST_ENABLED):
 *   launched=false, waitlist=false → hidden  (default; /app redirects home)
 *   launched=false, waitlist=true  → visible (pre-launch waitlist mode)
 *   launched=true,  waitlist=*     → visible (launch/download mode)
 */
export const computeAppVisible = (appLaunched: boolean, appWaitlistEnabled: boolean): boolean =>
  appLaunched || appWaitlistEnabled
