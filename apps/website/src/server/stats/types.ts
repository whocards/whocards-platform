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

export type AnswerTimestampRow = {createdAt: Date}

export type WeeklyPoint = {
  /** Monday (UTC) that starts this week, `YYYY-MM-DD`. */
  weekStart: string
  count: number
}

export type NamedCount = {name: string; count: number}

export type StatsSnapshot = {
  questionsAnswered: MetricResult<{total: number; thisWeek: number}>
  platformBreakdown: MetricResult<PlatformBreakdown>
  weeklyTrend: MetricResult<WeeklyPoint[]>
  activeDevices: MetricResult<{total: number; last30Days: number}>
  decksPlayed: MetricResult<{total: number}>
  languages: MetricResult<{spoken: number; ofTotal: number}>
  countries: MetricResult<NamedCount[]>
  installsIos: MetricResult<{count: number}>
  installsAndroid: MetricResult<{count: number}>
  dataSince: MetricResult<{date: string}>
}
