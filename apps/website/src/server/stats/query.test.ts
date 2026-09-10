import {beforeEach, describe, expect, it} from 'vitest'
import * as schema from '../db/schema'
import {resetTestDb} from '../db/test-helpers'
import type {TestDb} from '../db/test-helpers'
import {
  getActiveDevices,
  getAnswerTimestamps,
  getDecksPlayed,
  getLanguageCounts,
  getLiveEventTimestamps,
  getLiveEvents,
  getPlatformCounts,
  getQuestionsAnswered,
} from './query'

// Exercises the real aggregate SQL against an in-process Postgres (pglite) —
// mirrors ../db/upsert.test.ts's style. One shared PGlite instance for the
// whole run, truncated between tests (see ../db/test-helpers).
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

describe('getQuestionsAnswered', () => {
  it('counts total answers and returns 0 for an empty table', async () => {
    expect(await getQuestionsAnswered(db)).toEqual({total: 0, thisWeek: 0})
  })

  it('counts rows written this week vs. older rows', async () => {
    await insertAnswer({createdAt: new Date().toISOString()})
    await insertAnswer({createdAt: '2000-01-01T00:00:00.000Z'})
    const result = await getQuestionsAnswered(db)
    expect(result.total).toBe(2)
    expect(result.thisWeek).toBe(1)
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

describe('getAnswerTimestamps', () => {
  it('only returns rows inside the trend window', async () => {
    await insertAnswer({createdAt: new Date().toISOString()})
    await insertAnswer({createdAt: '2000-01-01T00:00:00.000Z'})
    const rows = await getAnswerTimestamps(db)
    expect(rows).toHaveLength(1)
  })
})

describe('getActiveDevices', () => {
  it('counts distinct devices overall and in the last 30 days', async () => {
    await insertAnswer({deviceId: 'a', createdAt: new Date().toISOString()})
    await insertAnswer({deviceId: 'a', createdAt: new Date().toISOString()})
    await insertAnswer({deviceId: 'b', createdAt: '2000-01-01T00:00:00.000Z'})
    const result = await getActiveDevices(db)
    expect(result.total).toBe(2)
    expect(result.last30Days).toBe(1)
  })
})

describe('getDecksPlayed', () => {
  it('counts distinct deck slugs', async () => {
    await insertAnswer({deckSlug: 'classic'})
    await insertAnswer({deckSlug: 'classic'})
    await insertAnswer({deckSlug: 'deep-cuts'})
    expect(await getDecksPlayed(db)).toEqual({total: 2})
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

const insertConference = async () => {
  await db.insert(schema.conference).values({name: 'Hajnalig', isActive: true})
  const [conf] = await db.select().from(schema.conference)
  if (!conf) throw new Error('conference insert failed')
  return conf
}

const insertLiveEvent = (
  conferenceId: number,
  overrides: Partial<typeof schema.conferenceQuestionTracking.$inferInsert> = {}
) =>
  db.insert(schema.conferenceQuestionTracking).values({
    conferenceId,
    questionId: 1,
    language: 'hu',
    ...overrides,
  })

describe('getLiveEvents', () => {
  it('counts conference_question_tracking rows, separate from the answer table', async () => {
    const conf = await insertConference()
    await insertLiveEvent(conf.id, {questionId: 1})
    await insertLiveEvent(conf.id, {questionId: 2})
    await insertAnswer() // an ordinary Answer must not be counted as a Live event
    const result = await getLiveEvents(db)
    expect(result.total).toBe(2)
  })

  it('counts rows written this week vs. older rows', async () => {
    const conf = await insertConference()
    await insertLiveEvent(conf.id, {createdAt: new Date().toISOString()})
    await insertLiveEvent(conf.id, {createdAt: '2000-01-01T00:00:00.000Z'})
    const result = await getLiveEvents(db)
    expect(result.total).toBe(2)
    expect(result.thisWeek).toBe(1)
  })
})

describe('getLiveEventTimestamps', () => {
  it('only returns rows inside the trend window', async () => {
    const conf = await insertConference()
    await insertLiveEvent(conf.id, {createdAt: new Date().toISOString()})
    await insertLiveEvent(conf.id, {createdAt: '2000-01-01T00:00:00.000Z'})
    const rows = await getLiveEventTimestamps(db)
    expect(rows).toHaveLength(1)
  })
})
