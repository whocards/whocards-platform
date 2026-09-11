import {gte, sql} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import {ANSWER_PLATFORMS} from '@whocards/api/platform'
import {currentWeekStart} from './date-utils'
import type {AnswerTimestampRow, NamedCount, Platform, PlatformCountRow} from './types'
import * as schema from '../db/schema'

type Db<T extends PgQueryResultHKT> = PgDatabase<T, typeof schema>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TREND_WINDOW_WEEKS = 26
const ACTIVE_WINDOW_DAYS = 30

/** "This week" starts Monday 00:00 UTC, matching the weekly chart's last bar. */
export const getQuestionsAnswered = async <T extends PgQueryResultHKT>(
  database: Db<T>,
  now: Date = new Date()
): Promise<{total: number; thisWeek: number}> => {
  const weekStart = currentWeekStart(now)
  const [row] = await database
    .select({
      // count() is a bigint, which the driver returns as a string.
      total: sql<string>`count(*)`,
      thisWeek: sql<string>`count(*) filter (where ${schema.answer.createdAt} >= ${weekStart.toISOString()})`,
    })
    .from(schema.answer)
  return {total: Number(row?.total ?? 0), thisWeek: Number(row?.thisWeek ?? 0)}
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

export const getDecksPlayed = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{total: number}> => {
  const [row] = await database
    .select({total: sql<string>`count(distinct ${schema.answer.deckSlug})`})
    .from(schema.answer)
  return {total: Number(row?.total ?? 0)}
}

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

/** Distinct Devices per country (ISO code), unfiltered — the caller applies the privacy threshold. */
export const getCountryCounts = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<NamedCount[]> => {
  const rows = await database
    .select({
      country: schema.answer.country,
      count: sql<string>`count(distinct ${schema.answer.deviceId})`,
    })
    .from(schema.answer)
    .where(sql`${schema.answer.country} is not null`)
    .groupBy(schema.answer.country)
  return rows
    .filter((row): row is {country: string; count: string} => row.country !== null)
    .map((row) => ({name: row.country, count: Number(row.count)}))
}

export const getDataSince = async <T extends PgQueryResultHKT>(
  database: Db<T>
): Promise<{date: string} | undefined> => {
  const [row] = await database
    .select({earliest: sql<string | null>`min(${schema.answer.createdAt})`})
    .from(schema.answer)
  return row?.earliest ? {date: row.earliest} : undefined
}
