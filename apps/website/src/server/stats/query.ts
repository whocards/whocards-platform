/**
 * Raw SQL aggregates backing the public stats page. Every function takes an
 * injected `database` (typed against the shared schema) rather than importing
 * the live client directly, so this module can run against the in-process
 * PGlite test harness (see ../db/test-helpers) exactly like ./upsert.ts.
 *
 * The Answer record (`answer` table) is the headline source for
 * questions-answered/platform/trend — CONTEXT.md calls it out as the single
 * source of truth, not PostHog. `conference_question_tracking` (Hajnalig-style
 * in-person events) is counted separately as "Live events" because those rows
 * have no Device — but per CONTEXT.md it is the *same* Answer concept in its
 * first, event-scoped form, not a distinct kind of interaction, so its counts
 * are folded into the hero total and weekly trend, not siloed off from them.
 */
import {gte, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import {ANSWER_PLATFORMS} from '@whocards/api/platform'
import type {AnswerTimestampRow, NamedCount, Platform, PlatformCountRow} from './types'
import * as schema from '../db/schema'

type Db<T extends PgQueryResultHKT> = PgDatabase<T, typeof schema>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** How far back the weekly trend chart looks — enough for a meaningful shape without an unbounded scan. */
const TREND_WINDOW_WEEKS = 26
/** "Active" device window for the counter row. */
const ACTIVE_WINDOW_DAYS = 30

/** Total Answers ever recorded, and how many landed in the last 7 days. */
export const getQuestionsAnswered = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{total: number; thisWeek: number}> => {
  const weekAgo = new Date(Date.now() - WEEK_MS)
  const [row] = await database
    .select({
      // Postgres returns COUNT() as a bigint, which the driver serializes as a
      // string — type it as `string` (not `number`) so the `Number(...)` below
      // is a real conversion, not a no-op the linter flags.
      total: sql<string>`count(*)`,
      thisWeek: sql<string>`count(*) filter (where ${schema.answer.createdAt} >= ${weekAgo.toISOString()})`,
    })
    .from(schema.answer)
  return {total: Number(row?.total ?? 0), thisWeek: Number(row?.thisWeek ?? 0)}
}

const isPlatform = (value: string | null): value is Platform =>
  value !== null && (ANSWER_PLATFORMS as readonly string[]).includes(value)

/** One row per distinct `platform` value (including `null`, for legacy/un-instrumented rows). */
export const getPlatformCounts = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<PlatformCountRow[]> => {
  const rows = await database
    .select({platform: schema.answer.platform, count: sql<string>`count(*)`})
    .from(schema.answer)
    .groupBy(schema.answer.platform)
  return rows.map((row) => ({
    platform: isPlatform(row.platform) ? row.platform : null,
    count: Number(row.count),
  }))
}

/**
 * Raw Answer timestamps within the trend window — bucketed into weeks by
 * `./rollups.ts`'s `weeklyTrend`, not here, so the bucketing logic stays
 * pure/testable without a DB.
 */
export const getAnswerTimestamps = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<AnswerTimestampRow[]> => {
  const windowStart = new Date(Date.now() - TREND_WINDOW_WEEKS * WEEK_MS)
  const rows = await database
    .select({createdAt: schema.answer.createdAt})
    .from(schema.answer)
    .where(gte(schema.answer.createdAt, windowStart.toISOString()))
  return rows.map((row) => ({createdAt: new Date(row.createdAt)}))
}

/** Distinct Devices ever seen, and distinct Devices seen in the last 30 days. */
export const getActiveDevices = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{total: number; last30Days: number}> => {
  const windowStart = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await database
    .select({
      total: sql<string>`count(distinct ${schema.answer.deviceId})`,
      last30Days: sql<string>`count(distinct ${schema.answer.deviceId}) filter (where ${schema.answer.createdAt} >= ${windowStart.toISOString()})`,
    })
    .from(schema.answer)
  return {total: Number(row?.total ?? 0), last30Days: Number(row?.last30Days ?? 0)}
}

/** Distinct Decks with at least one recorded Answer. */
export const getDecksPlayed = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{total: number}> => {
  const [row] = await database
    .select({total: sql<string>`count(distinct ${schema.answer.deckSlug})`})
    .from(schema.answer)
  return {total: Number(row?.total ?? 0)}
}

/**
 * Distinct-device count per language. Raw (unfiltered) rows — the privacy
 * threshold (hide rows under 5 devices) is applied by the caller via
 * `applyPrivacyThreshold`, not here, so this stays a plain aggregate.
 */
export const getLanguageCounts = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<NamedCount[]> => {
  const rows = await database
    .select({
      language: schema.answer.language,
      count: sql<string>`count(distinct ${schema.answer.deviceId})`,
    })
    .from(schema.answer)
    .where(sql`${schema.answer.language} is not null`)
    .groupBy(schema.answer.language)
  return rows
    .filter((row): row is {language: string; count: string} => row.language !== null)
    .map((row) => ({name: row.language, count: Number(row.count)}))
}

/** Earliest Answer timestamp ever recorded — powers the footer's "data since" note. */
export const getDataSince = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{date: string} | undefined> => {
  const [row] = await database
    .select({earliest: sql<string | null>`min(${schema.answer.createdAt})`})
    .from(schema.answer)
  return row?.earliest ? {date: row.earliest} : undefined
}

/**
 * Live events (in-person, e.g. Hajnalig conference decks): total rows in
 * `conference_question_tracking`, and how many landed in the last 7 days —
 * same shape as `getQuestionsAnswered` so the two can be summed for the hero
 * total and "this week" badge. Kept as its own slice in the platform
 * breakdown (rather than merged into web/iOS/Android) since these rows have
 * no Device to attribute to a platform.
 */
export const getLiveEvents = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{total: number; thisWeek: number}> => {
  const weekAgo = new Date(Date.now() - WEEK_MS)
  const [row] = await database
    .select({
      total: sql<string>`count(*)`,
      thisWeek: sql<string>`count(*) filter (where ${schema.conferenceQuestionTracking.createdAt} >= ${weekAgo.toISOString()})`,
    })
    .from(schema.conferenceQuestionTracking)
  return {total: Number(row?.total ?? 0), thisWeek: Number(row?.thisWeek ?? 0)}
}

/**
 * Raw Live-event timestamps within the trend window — same shape as
 * `getAnswerTimestamps` (`{createdAt}`) so the caller can concatenate both
 * arrays before handing them to `weeklyTrend`, letting an in-person spike
 * (e.g. a conference day) show up in the weekly chart.
 */
export const getLiveEventTimestamps = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<AnswerTimestampRow[]> => {
  const windowStart = new Date(Date.now() - TREND_WINDOW_WEEKS * WEEK_MS)
  const rows = await database
    .select({createdAt: schema.conferenceQuestionTracking.createdAt})
    .from(schema.conferenceQuestionTracking)
    .where(gte(schema.conferenceQuestionTracking.createdAt, windowStart.toISOString()))
  return rows.map((row) => ({createdAt: new Date(row.createdAt)}))
}
