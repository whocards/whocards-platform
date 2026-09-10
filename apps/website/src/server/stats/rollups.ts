import {weekStartOf} from './date-utils'
import type {
  AnswerTimestampRow,
  NamedCount,
  PlatformBreakdown,
  PlatformCountRow,
  WeeklyPoint,
} from './types'

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

/** Raw weekly counts (no smoothing), zero-filling empty weeks through the current week. */
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

/** Language/country rows backed by fewer Devices than this are hidden — small buckets can identify people. */
export const MIN_DEVICE_COUNT = 5

export const applyPrivacyThreshold = (
  rows: NamedCount[],
  minCount: number = MIN_DEVICE_COUNT
): NamedCount[] => rows.filter((row) => row.count >= minCount)
