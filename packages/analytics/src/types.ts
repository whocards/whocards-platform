/**
 * Shared shapes for the public stats page (analytics page). Kept framework/host
 * agnostic: nothing here imports Drizzle, Astro, or a fetch client directly, so
 * the rollups and orchestration are plain-TS testable without a DB or network.
 *
 * Every external-source result is a tagged `MetricResult<T>` rather than a bare
 * value or a thrown error — a source that isn't configured (no credentials) or
 * isn't reachable degrades to a status the page can render honestly ("not
 * connected yet") instead of a fake number or a broken page.
 */

/**
 * - `live` — real data, fetched (or computed from first-party data) successfully.
 * - `needs-credentials` — the source integration exists but env vars aren't set.
 * - `needs-instrumentation` — nothing is wired up yet to produce this metric.
 * - `unavailable` — configured, but the fetch failed (network/auth/parse error).
 */
export type MetricStatus = 'live' | 'needs-credentials' | 'needs-instrumentation' | 'unavailable'

export type MetricResult<T> =
  | {status: 'live'; value: T; source: string}
  | {status: Exclude<MetricStatus, 'live'>; source: string; reason?: string}

/** Helper constructors — keep call sites from hand-rolling the union shape. */
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
export const needsInstrumentation = (source: string, reason?: string): MetricResult<never> => ({
  status: 'needs-instrumentation',
  source,
  reason,
})
export const unavailable = (source: string, reason?: string): MetricResult<never> => ({
  status: 'unavailable',
  source,
  reason,
})

/** The platforms an Answer (or a catalog event) can be attributed to. */
export type Platform = 'web' | 'ios' | 'android'

/** One row of raw per-platform answer counts, as read from the DB. `null` = unattributed. */
export type PlatformCountRow = {platform: Platform | null; count: number}

export type PlatformBreakdown = {
  web: number
  ios: number
  android: number
  /** Rows written before the `platform` column existed, or by an un-updated client. */
  unattributed: number
  total: number
}

/** One raw (unbucketed) answer timestamp, for weekly-trend rollups. */
export type AnswerTimestampRow = {createdAt: Date}

export type WeeklyPoint = {
  /** ISO date (UTC) of the Monday that starts this week. */
  weekStart: string
  count: number
}

/** A named count subject to the privacy threshold (e.g. one language, one country). */
export type NamedCount = {name: string; count: number}

export type InstallCounts = {
  ios: number
  android: number
}

export type CountrySplit = NamedCount[]

/** The full snapshot the stats page renders. Each field degrades independently. */
export type StatsSnapshot = {
  generatedAt: string
  questionsAsked: MetricResult<{total: number; thisWeek: number}>
  platformBreakdown: MetricResult<PlatformBreakdown>
  weeklyTrend: MetricResult<WeeklyPoint[]>
  liveEvents: MetricResult<{total: number}>
  activeDevices: MetricResult<{total: number; last30Days: number}>
  decksPlayed: MetricResult<{total: number}>
  languages: MetricResult<{spoken: number; ofTotal: number}>
  countries: MetricResult<CountrySplit>
  installs: MetricResult<InstallCounts>
  /** ISO date of the earliest recorded Answer — shown in the footer methodology note. */
  dataSince: MetricResult<{date: string}>
}
