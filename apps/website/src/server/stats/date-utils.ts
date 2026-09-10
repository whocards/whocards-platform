/**
 * Shared week-boundary helper for the stats page's Postgres queries and
 * rollups. Both need the *same* cutoff — the weekly trend chart buckets by
 * Monday-00:00-UTC week, and the "this week" counters (query.ts) must agree
 * with it, or the headline number and the chart's current-week bar can show
 * different counts for what's supposed to be the same week (CodeRabbit
 * finding on PR #298).
 */

/** Monday (UTC) of the week containing `date`, as an ISO `YYYY-MM-DD` string. */
export const weekStartOf = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0=Sun..6=Sat — shift to Monday-start.
  const dayOfWeek = d.getUTCDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  const [iso] = d.toISOString().split('T')
  return iso ?? d.toISOString()
}

/** Monday 00:00:00.000 UTC of the week containing `now`, as a `Date`. */
export const currentWeekStart = (now: Date = new Date()): Date =>
  new Date(`${weekStartOf(now)}T00:00:00.000Z`)
