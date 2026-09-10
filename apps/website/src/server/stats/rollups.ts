/**
 * Pure rollup functions for the stats page. No DB, no fetch — these take rows
 * already read from Postgres (or a fixture in tests) and shape them into the
 * page's chart/counter inputs. Kept pure so they're cheap to unit test and can
 * be reused unchanged if the storage layer ever changes.
 */
import type {
  AnswerTimestampRow,
  NamedCount,
  PlatformBreakdown,
  PlatformCountRow,
  WeeklyPoint,
} from './types'

/**
 * Buckets raw per-platform counts (one row per distinct `platform` value,
 * including `null` for legacy/un-instrumented rows) into the fixed shape the
 * page renders. Unknown platform strings (shouldn't happen — the DB column is
 * populated only from `ANSWER_PLATFORMS` — but a stray value must not silently
 * vanish) are folded into `unattributed` rather than thrown away.
 */
export const platformBreakdown = (rows: PlatformCountRow[]): PlatformBreakdown => {
  const result: PlatformBreakdown = {web: 0, ios: 0, android: 0, unattributed: 0, total: 0}
  for (const row of rows) {
    result.total += row.count
    if (row.platform === 'web') result.web += row.count
    else if (row.platform === 'ios') result.ios += row.count
    else if (row.platform === 'android') result.android += row.count
    else result.unattributed += row.count
  }
  return result
}

/** Monday (UTC) of the week containing `date`, as an ISO `YYYY-MM-DD` string. */
const weekStartOf = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0=Sun..6=Sat — shift to Monday-start.
  const dayOfWeek = d.getUTCDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  const [iso] = d.toISOString().split('T')
  return iso ?? d.toISOString()
}

/**
 * Buckets raw answer timestamps into weekly counts, unsmoothed (raw per-week
 * totals — the researcher findings explicitly called for no smoothing/rolling
 * average, so a real launch spike or a quiet week both stay visible). Weeks
 * with zero answers between the first row and the current week are filled in
 * as 0 — including a trailing gap if activity has gone quiet recently — so
 * the chart doesn't silently skip a gap or cut off before today (Greptile:
 * "Show inactive recent weeks"). `now` is injectable for tests.
 */
export const weeklyTrend = (rows: AnswerTimestampRow[], now: Date = new Date()): WeeklyPoint[] => {
  if (rows.length === 0) return []

  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = weekStartOf(row.createdAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const weeks = [...counts.keys()].toSorted()
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  if (!first || !last) return []

  const currentWeek = weekStartOf(now)
  const end = last > currentWeek ? last : currentWeek

  const points: WeeklyPoint[] = []
  let cursor = new Date(`${first}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)
  while (cursor <= endDate) {
    const [key] = cursor.toISOString().split('T')
    const weekStart = key ?? cursor.toISOString()
    points.push({weekStart, count: counts.get(weekStart) ?? 0})
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  return points
}

/**
 * Privacy threshold (researcher findings): never show a language/country
 * breakdown row backed by fewer than `minCount` distinct devices — small
 * buckets are re-identifying at low volume. Rows below the threshold are
 * dropped, not zeroed, so the page doesn't render a misleading "0".
 */
export const MIN_DEVICE_COUNT = 5

export const applyPrivacyThreshold = (
  rows: NamedCount[],
  minCount: number = MIN_DEVICE_COUNT
): NamedCount[] => rows.filter((row) => row.count >= minCount)
