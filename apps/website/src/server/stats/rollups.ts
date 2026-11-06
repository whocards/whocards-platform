import {addPeriods, periodStartOf} from './date-utils'
import type {
  NamedCount,
  PeriodCountRow,
  PlatformBreakdown,
  PlatformCountRow,
  Trend,
  TrendPeriod,
  TrendPoint,
} from './types'

export const platformBreakdown = (rows: PlatformCountRow[]): PlatformBreakdown => {
  const result: PlatformBreakdown = {web: 0, ios: 0, android: 0, unattributed: 0}
  for (const row of rows) {
    if (row.platform === 'web') result.web += row.count
    else if (row.platform === 'ios') result.ios += row.count
    else if (row.platform === 'android') result.android += row.count
    else result.unattributed += row.count
  }
  return result
}

/** How many bars each granularity shows. Year has no cap: it's all-time. */
export const TREND_BARS = {week: 26, month: 24} as const

/** Raw per-period counts, zero-filled through the current period, from the later of first data or window start. */
export const periodTrend = (
  period: TrendPeriod,
  rows: PeriodCountRow[],
  now: Date = new Date()
): TrendPoint[] => {
  // Year is all-time, so no data means no bars; week and month still show their zero window.
  if (rows.length === 0 && period === 'year') return []

  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = periodStartOf(period, new Date(`${row.periodStart}T00:00:00.000Z`))
    counts.set(key, (counts.get(key) ?? 0) + row.count)
  }
  const keys = [...counts.keys()].toSorted()
  const first = keys[0]
  const current = periodStartOf(period, now)
  const last = keys.at(-1) ?? current
  const end = last > current ? last : current
  const bars = period === 'year' ? undefined : TREND_BARS[period]
  const windowStart = bars ? addPeriods(period, end, -(bars - 1)) : (first ?? current)

  const points: TrendPoint[] = []
  let cursor = first && first > windowStart ? first : windowStart
  while (cursor <= end) {
    points.push({periodStart: cursor, count: counts.get(cursor) ?? 0})
    cursor = addPeriods(period, cursor, 1)
  }
  return points
}

/** Weekly rows are already windowed; monthly rows are all-time and also fold into years. */
export const buildTrend = (
  weekRows: PeriodCountRow[],
  monthRows: PeriodCountRow[],
  now: Date = new Date()
): Trend => ({
  week: periodTrend('week', weekRows, now),
  month: periodTrend('month', monthRows, now),
  year: periodTrend('year', monthRows, now),
})

/** Language/country rows backed by fewer Devices than this are hidden — small buckets can identify people. */
export const MIN_DEVICE_COUNT = 5

export const applyPrivacyThreshold = (
  rows: NamedCount[],
  minCount: number = MIN_DEVICE_COUNT
): NamedCount[] => rows.filter((row) => row.count >= minCount)
