import type {TrendPeriod} from './types'

const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Monday (UTC) of the week containing `date`, as `YYYY-MM-DD`. */
export const weekStartOf = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0=Sun..6=Sat
  const dayOfWeek = d.getUTCDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  return isoDate(d)
}

export const currentWeekStart = (now: Date = new Date()): Date =>
  new Date(`${weekStartOf(now)}T00:00:00.000Z`)

/** First day (UTC) of the week / month / year containing `date`, as `YYYY-MM-DD`. */
export const periodStartOf = (period: TrendPeriod, date: Date): string => {
  if (period === 'week') return weekStartOf(date)
  const month = period === 'month' ? date.getUTCMonth() : 0
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), month, 1)))
}

/** Start of the period `n` periods after `periodStart` (negative `n` goes back). */
export const addPeriods = (period: TrendPeriod, periodStart: string, n: number): string => {
  const d = new Date(`${periodStart}T00:00:00.000Z`)
  if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * n)
  else if (period === 'month') d.setUTCMonth(d.getUTCMonth() + n)
  else d.setUTCFullYear(d.getUTCFullYear() + n)
  return isoDate(d)
}
