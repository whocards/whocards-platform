/**
 * In-app review eligibility and request logic.
 *
 * Policy (Apple + Expo):
 * - No custom pre-prompt before the OS review dialog.
 * - At most once per app version (persisted via AsyncStorage).
 * - Only after a proven moment of value: ≥10 answered cards across ≥2 sessions.
 * - Attempt only after play completes (e.g. on exit / app backgrounded), never
 *   mid-card and never at launch.
 * - Fail silently when `isAvailableAsync()` / `hasAction()` returns false.
 *
 * Storage keys (all prefixed `whocards-review:`)
 *   whocards-review:card-count    — total answered cards (cumulative, integer string)
 *   whocards-review:session-count — total sessions that saw ≥1 answered card
 *   whocards-review:last-version  — app version string for which review was attempted
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEY_CARD_COUNT = 'whocards-review:card-count'
const KEY_SESSION_COUNT = 'whocards-review:session-count'
const KEY_LAST_VERSION = 'whocards-review:last-version'

// ---------------------------------------------------------------------------
// Eligibility thresholds
// ---------------------------------------------------------------------------

/** Minimum total answered cards before the prompt is eligible. */
export const MIN_CARDS = 10
/** Minimum number of play sessions before the prompt is eligible. */
export const MIN_SESSIONS = 2

// ---------------------------------------------------------------------------
// Exported types (for tests)
// ---------------------------------------------------------------------------

export type ReviewState = {
  cardCount: number
  sessionCount: number
  lastVersion: string | null
}

// ---------------------------------------------------------------------------
// Storage helpers (pure I/O; no in-memory cache — counts accumulate across
// sessions, so always read from AsyncStorage rather than caching)
// ---------------------------------------------------------------------------

const readInt = async (key: string): Promise<number> => {
  const raw = await AsyncStorage.getItem(key)
  if (raw === null) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

const writeInt = async (key: string, value: number): Promise<void> => {
  await AsyncStorage.setItem(key, String(value))
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Increments the persisted card count by `delta` (default 1).
 * Returns the new cumulative count.
 */
export const incrementCardCount = async (delta = 1): Promise<number> => {
  const current = await readInt(KEY_CARD_COUNT)
  const next = current + delta
  await writeInt(KEY_CARD_COUNT, next)
  return next
}

/**
 * Increments the persisted session count by 1.
 * Call once per play session (e.g. on GAME_STARTED).
 * Returns the new cumulative session count.
 */
export const incrementSessionCount = async (): Promise<number> => {
  const current = await readInt(KEY_SESSION_COUNT)
  const next = current + 1
  await writeInt(KEY_SESSION_COUNT, next)
  return next
}

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------

/**
 * Returns the current ReviewState from AsyncStorage (no cache).
 */
export const getReviewState = async (): Promise<ReviewState> => {
  const [cardCount, sessionCount, lastVersion] = await Promise.all([
    readInt(KEY_CARD_COUNT),
    readInt(KEY_SESSION_COUNT),
    AsyncStorage.getItem(KEY_LAST_VERSION),
  ])
  return {cardCount, sessionCount, lastVersion}
}

/**
 * Returns true when all eligibility conditions are met for `appVersion`:
 * - cardCount ≥ MIN_CARDS
 * - sessionCount ≥ MIN_SESSIONS
 * - We have NOT already attempted a review for this `appVersion`
 */
export const isReviewEligible = (state: ReviewState, appVersion: string): boolean => {
  return (
    state.cardCount >= MIN_CARDS &&
    state.sessionCount >= MIN_SESSIONS &&
    state.lastVersion !== appVersion
  )
}

// ---------------------------------------------------------------------------
// Persist attempt
// ---------------------------------------------------------------------------

/**
 * Marks the review as having been attempted for `appVersion`.
 * Must be called before invoking the native UI to prevent duplicate prompts
 * if the app is backgrounded mid-call.
 */
export const markReviewAttempted = async (appVersion: string): Promise<void> => {
  await AsyncStorage.setItem(KEY_LAST_VERSION, appVersion)
}
