import {beforeEach, describe, expect, it} from 'vitest'
import * as schema from '../db/schema'
import {resetTestDb} from '../db/test-helpers'
import type {TestDb} from '../db/test-helpers'
import {
  getAnswerTotals,
  getCountryCounts,
  getLanguageCounts,
  getMonthlyCounts,
  getPlatformCounts,
  getWeeklyCounts,
} from './query'

let db: TestDb

beforeEach(async () => {
  db = await resetTestDb()
})

const insertAnswer = (overrides: Partial<typeof schema.answer.$inferInsert> = {}) =>
  db.insert(schema.answer).values({
    deviceId: 'device-1',
    deckSlug: 'classic',
    questionId: 'q1',
    language: 'en',
    ...overrides,
  })

describe('getAnswerTotals', () => {
  it('returns zeros and no earliest date for an empty table', async () => {
    expect(await getAnswerTotals(db)).toEqual({
      answers: 0,
      answersThisWeek: 0,
      devices: 0,
      devicesLast30Days: 0,
      decks: 0,
      earliest: null,
    })
  })

  it('counts answers, distinct devices and decks, and the earliest answer day, in one pass', async () => {
    const now = new Date('2026-01-14T12:00:00.000Z') // Wed; week starts Mon 2026-01-12
    await insertAnswer({deviceId: 'a', deckSlug: 'classic', createdAt: '2026-01-12T00:00:00.000Z'})
    await insertAnswer({deviceId: 'a', deckSlug: 'classic', createdAt: '2026-01-13T00:00:00.000Z'})
    await insertAnswer({
      deviceId: 'b',
      deckSlug: 'deep-cuts',
      createdAt: '2025-12-20T00:00:00.000Z',
    })
    await insertAnswer({deviceId: 'c', deckSlug: 'classic', createdAt: '2025-06-01T23:30:00.000Z'})
    expect(await getAnswerTotals(db, now)).toEqual({
      answers: 4,
      answersThisWeek: 2,
      devices: 3,
      devicesLast30Days: 2,
      decks: 2,
      earliest: '2025-06-01',
    })
  })

  it('uses the Monday-00:00-UTC week cutoff, not a rolling 7-day window', async () => {
    const now = new Date('2026-01-14T12:00:00.000Z')
    await insertAnswer({createdAt: '2026-01-08T12:00:00.000Z'}) // within 7 days, but last week
    await insertAnswer({createdAt: '2026-01-12T00:00:00.000Z'})
    const result = await getAnswerTotals(db, now)
    expect(result.answers).toBe(2)
    expect(result.answersThisWeek).toBe(1)
  })
})

describe('getPlatformCounts', () => {
  it('groups by platform, including legacy NULL rows as their own bucket', async () => {
    await insertAnswer({platform: 'web'})
    await insertAnswer({platform: 'web'})
    await insertAnswer({platform: 'ios'})
    await insertAnswer({platform: null})
    const rows = await getPlatformCounts(db)
    const byPlatform = Object.fromEntries(rows.map((row) => [row.platform ?? 'null', row.count]))
    expect(byPlatform.web).toBe(2)
    expect(byPlatform.ios).toBe(1)
    expect(byPlatform.null).toBe(1)
  })
})

describe('getWeeklyCounts', () => {
  it('buckets by Monday-starting UTC week and only returns the last 26 weeks', async () => {
    const now = new Date('2026-01-14T12:00:00.000Z')
    await insertAnswer({createdAt: '2026-01-12T00:00:00.000Z'}) // Monday
    await insertAnswer({createdAt: '2026-01-11T23:59:59.000Z'}) // Sunday before, previous week
    await insertAnswer({createdAt: '2025-07-21T00:00:00.000Z'}) // 26th bar back: in
    await insertAnswer({createdAt: '2025-07-20T23:59:59.000Z'}) // one second earlier: out
    expect(await getWeeklyCounts(db, now)).toEqual([
      {periodStart: '2025-07-21', count: 1},
      {periodStart: '2026-01-05', count: 1},
      {periodStart: '2026-01-12', count: 1},
    ])
  })
})

describe('getMonthlyCounts', () => {
  it('buckets by calendar month (UTC) across all time', async () => {
    await insertAnswer({createdAt: '2000-01-31T23:59:59.000Z'})
    await insertAnswer({createdAt: '2000-02-01T00:00:00.000Z'})
    await insertAnswer({createdAt: '2000-02-15T00:00:00.000Z'})
    expect(await getMonthlyCounts(db)).toEqual([
      {periodStart: '2000-01-01', count: 1},
      {periodStart: '2000-02-01', count: 2},
    ])
  })
})

describe('getLanguageCounts', () => {
  it('counts distinct devices per language, unfiltered by privacy threshold', async () => {
    await insertAnswer({deviceId: 'a', language: 'en'})
    await insertAnswer({deviceId: 'b', language: 'en'})
    await insertAnswer({deviceId: 'c', language: 'hu'})
    const rows = await getLanguageCounts(db)
    const byLanguage = Object.fromEntries(rows.map((row) => [row.name, row.count]))
    expect(byLanguage.en).toBe(2)
    expect(byLanguage.hu).toBe(1)
  })

  it('excludes rows with a null language', async () => {
    await insertAnswer({language: null})
    const rows = await getLanguageCounts(db)
    expect(rows).toHaveLength(0)
  })
})

describe('getCountryCounts', () => {
  it('counts distinct devices per country and skips rows without one', async () => {
    await insertAnswer({deviceId: 'a', country: 'HU'})
    await insertAnswer({deviceId: 'a', country: 'HU'})
    await insertAnswer({deviceId: 'b', country: 'HU'})
    await insertAnswer({deviceId: 'c', country: 'AT'})
    await insertAnswer({deviceId: 'd', country: null})
    const rows = await getCountryCounts(db)
    expect(rows.toSorted((x, y) => x.name.localeCompare(y.name))).toEqual([
      {name: 'AT', count: 1},
      {name: 'HU', count: 2},
    ])
  })
})
