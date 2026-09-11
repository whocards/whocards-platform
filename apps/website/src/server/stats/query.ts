import {gte, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import {ANSWER_PLATFORMS} from '@whocards/api/platform'
import {addPeriods, currentWeekStart, weekStartOf} from './date-utils'
import {TREND_BARS} from './rollups'
import type {AnswerTotals, NamedCount, PeriodCountRow, Platform, PlatformCountRow} from './types'
import * as schema from '../db/schema'

type Db<T extends PgQueryResultHKT> = PgDatabase<T, typeof schema>

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_WINDOW_DAYS = 30

/**
 * One aggregate pass over the Answer record: hero total, "this week" (Monday 00:00 UTC,
 * matching the weekly chart's last bar), Devices, Decks, and the earliest Answer.
 */
export const getAnswerTotals = async <T extends PgQueryResultHKT>(
  database: Db<T>,
  now: Date = new Date()
): Promise<AnswerTotals> => {
  const weekStart = currentWeekStart(now).toISOString()
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS).toISOString()
  const [row] = await database
    .select({
      // count() is a bigint, which the driver returns as a string.
      answers: sql<string>`count(*)`,
      answersThisWeek: sql<string>`count(*) filter (where ${schema.answer.createdAt} >= ${weekStart})`,
      devices: sql<string>`count(distinct ${schema.answer.deviceId})`,
      devicesLast30Days: sql<string>`count(distinct ${schema.answer.deviceId}) filter (where ${schema.answer.createdAt} >= ${activeSince})`,
      decks: sql<string>`count(distinct ${schema.answer.deckSlug})`,
      earliest: sql<
        string | null
      >`to_char(min(${schema.answer.createdAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
    })
    .from(schema.answer)
  return {
    answers: Number(row?.answers ?? 0),
    answersThisWeek: Number(row?.answersThisWeek ?? 0),
    devices: Number(row?.devices ?? 0),
    devicesLast30Days: Number(row?.devicesLast30Days ?? 0),
    decks: Number(row?.decks ?? 0),
    earliest: row?.earliest ?? null,
  }
}

const isPlatform = (value: string | null): value is Platform =>
  value !== null && (ANSWER_PLATFORMS as readonly string[]).includes(value)

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

/** Answers per calendar bucket (UTC), grouped in SQL so only one row per bucket crosses the wire. */
const periodCounts = async <T extends PgQueryResultHKT>(
  database: Db<T>,
  period: 'week' | 'month',
  since?: string
): Promise<PeriodCountRow[]> => {
  // date_trunc('week') is Monday-based, matching weekStartOf(). `at time zone 'UTC'` makes the
  // bucket independent of the connection's TimeZone setting.
  const bucket = sql<string>`to_char(date_trunc(${sql.raw(`'${period}'`)}, ${schema.answer.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`
  const rows = await database
    .select({periodStart: bucket, count: sql<string>`count(*)`})
    .from(schema.answer)
    .where(since ? gte(schema.answer.createdAt, since) : undefined)
    .groupBy(bucket)
    .orderBy(bucket)
  return rows.map((row) => ({periodStart: row.periodStart, count: Number(row.count)}))
}

/** The last TREND_BARS.week Monday-starting weeks, including the current (partial) one. */
export const getWeeklyCounts = <T extends PgQueryResultHKT>(
  database: Db<T>,
  now: Date = new Date()
): Promise<PeriodCountRow[]> => {
  const since = addPeriods('week', weekStartOf(now), -(TREND_BARS.week - 1))
  return periodCounts(database, 'week', `${since}T00:00:00.000Z`)
}

/** All-time monthly buckets; the yearly series is folded from these, so one query serves both. */
export const getMonthlyCounts = <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<PeriodCountRow[]> => periodCounts(database, 'month')

const distinctDevicesBy = async <T extends PgQueryResultHKT>(
  database: Db<T>,
  column: typeof schema.answer.language | typeof schema.answer.country
): Promise<NamedCount[]> => {
  const rows = await database
    .select({name: column, count: sql<string>`count(distinct ${schema.answer.deviceId})`})
    .from(schema.answer)
    .where(sql`${column} is not null`)
    .groupBy(column)
  return rows
    .filter((row): row is {name: string; count: string} => row.name !== null)
    .map((row) => ({name: row.name, count: Number(row.count)}))
}

/** Distinct Devices per language, unfiltered — the caller applies the privacy threshold. */
export const getLanguageCounts = <T extends PgQueryResultHKT>(database: Db<T>) =>
  distinctDevicesBy(database, schema.answer.language)

/** Distinct Devices per country (ISO code), unfiltered — the caller applies the privacy threshold. */
export const getCountryCounts = <T extends PgQueryResultHKT>(database: Db<T>) =>
  distinctDevicesBy(database, schema.answer.country)
