/**
 * The Device id (CONTEXT.md › Device): a stable anonymous id minted once on
 * first run, persisted in localStorage, and attached to every Answer. It is the
 * only identity that exists pre-accounts, and is deliberately durable so a
 * Device's history can later be claimed into an account.
 */

/** Durable localStorage key for the Device id. */
export const DEVICE_ID_KEY = 'whocards-device-id'

/**
 * The legacy key the web Play island used for its anonymous tracking id. When a
 * value exists under it we ADOPT it as the Device id so current devices keep
 * their identity across the rename.
 */
export const LEGACY_USER_ID_KEY = 'play-user-id'

/**
 * Returns this Device's stable id, minting and persisting one on first run.
 *
 * On first call after the rename it adopts any existing `play-user-id` value so
 * a returning browser keeps the same identity. SSR-safe: returns '' when there
 * is no `window` (no Device exists off the client).
 */
export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return ''

  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing

  // adopt the legacy /play tracking id so returning devices keep their identity.
  // NOTE: the hajnalig deck used a separate key ('hajnalig-user-id') we
  // intentionally do NOT adopt — those devices reset to a fresh id by decision
  // (the conference tracking is event-scoped and folds in later, 0003).
  const legacy = localStorage.getItem(LEGACY_USER_ID_KEY)
  const deviceId = legacy ?? crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}
