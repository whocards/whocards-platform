import type {AnswerPlatform} from '@whocards/api/platform'

export type MetricStatus = 'live' | 'needs-credentials' | 'needs-instrumentation' | 'unavailable'

export type MetricResult<T> =
  | {status: 'live'; value: T; source: string}
  | {status: Exclude<MetricStatus, 'live'>; source: string; reason?: string}

export const live = <T>(value: T, source: string): MetricResult<T> => ({
  status: 'live',
  value,
  source,
})
export const needsCredentials = (source: string, reason?: string): MetricResult<never> => ({
  status: 'needs-credentials',
  source,
  reason,
})
export const unavailable = (source: string, reason?: string): MetricResult<never> => ({
  status: 'unavailable',
  source,
  reason,
})

export type Platform = AnswerPlatform

export type PlatformCountRow = {platform: Platform | null; count: number}

export type PlatformBreakdown = {
  web: number
  ios: number
  android: number
  unattributed: number
  total: number
}

export const TREND_PERIODS = ['week', 'month', 'year'] as const
export type TrendPeriod = (typeof TREND_PERIODS)[number]

/** One bucket as the DB returns it: `periodStart` is `YYYY-MM-DD` (UTC). */
export type PeriodCountRow = {periodStart: string; count: number}

export type TrendPoint = {
  /** First day (UTC) of the bucket, `YYYY-MM-DD`: a Monday, the 1st, or Jan 1. */
  periodStart: string
  count: number
}

export type Trend = Record<TrendPeriod, TrendPoint[]>

/** Every all-time aggregate the page needs from the Answer record, from one query. */
export type AnswerTotals = {
  answers: number
  answersThisWeek: number
  devices: number
  devicesLast30Days: number
  decks: number
  /** `YYYY-MM-DD` of the earliest Answer, or null when the table is empty. */
  earliest: string | null
}

export type NamedCount = {name: string; count: number}

export type StatsSnapshot = {
  questionsAnswered: MetricResult<{total: number; thisWeek: number}>
  platformBreakdown: MetricResult<PlatformBreakdown>
  trend: MetricResult<Trend>
  activeDevices: MetricResult<{total: number; last30Days: number}>
  decksPlayed: MetricResult<{total: number}>
  languages: MetricResult<{spoken: number; ofTotal: number}>
  countries: MetricResult<NamedCount[]>
  installsIos: MetricResult<{count: number}>
  installsAndroid: MetricResult<{count: number}>
  dataSince: MetricResult<{date: string}>
}
