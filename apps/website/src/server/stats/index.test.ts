import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {AppStoreConnectCredentials} from './sources/app-store-connect'
import type {GooglePlayCredentials} from './sources/google-play'
import type {PostHogCredentials} from './sources/posthog'
import type {AnswerTimestampRow, MetricResult, NamedCount, PlatformCountRow} from './types'

// This suite exercises the orchestration in ./index.ts in isolation from
// Postgres and the network: every dependency (query.ts, the three source
// clients, and ~env/~server/db) is mocked, so what's under test is purely
// "does buildStatsSnapshot wire the pieces together correctly" — the pieces
// themselves (SQL aggregates, rollups, fetch clients) already have their own
// unit tests in ./query.test.ts, ./rollups.test.ts, and ./sources/*.test.ts.
//
// Each test does a fresh `vi.resetModules()` + dynamic `import('./index')`
// so the module-level snapshot cache doesn't leak between cases.

const envMock: Record<string, string | undefined> = {
  APP_STORE_CONNECT_KEY_ID: undefined,
  APP_STORE_CONNECT_ISSUER_ID: undefined,
  APP_STORE_CONNECT_PRIVATE_KEY: undefined,
  APP_STORE_CONNECT_VENDOR_NUMBER: undefined,
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: undefined,
  GOOGLE_PLAY_REPORTS_BUCKET: undefined,
  POSTHOG_PERSONAL_API_KEY: undefined,
  POSTHOG_PROJECT_ID: undefined,
  PUBLIC_POSTHOG_UI_HOST: 'https://eu.posthog.com',
}
vi.mock('~env', () => ({env: envMock}))
vi.mock('~server/db', () => ({db: {}}))

const query = vi.hoisted(() => ({
  getQuestionsAnswered: vi.fn<() => Promise<{total: number; thisWeek: number}>>(),
  getPlatformCounts: vi.fn<() => Promise<PlatformCountRow[]>>(),
  getAnswerTimestamps: vi.fn<() => Promise<AnswerTimestampRow[]>>(),
  getActiveDevices: vi.fn<() => Promise<{total: number; last30Days: number}>>(),
  getDecksPlayed: vi.fn<() => Promise<{total: number}>>(),
  getLanguageCounts: vi.fn<() => Promise<NamedCount[]>>(),
  getLiveEvents: vi.fn<() => Promise<{total: number; thisWeek: number}>>(),
  getLiveEventTimestamps: vi.fn<() => Promise<AnswerTimestampRow[]>>(),
  getDataSince: vi.fn<() => Promise<{date: string} | undefined>>(),
}))
vi.mock('./query', () => query)

const sources = vi.hoisted(() => ({
  fetchAppStoreInstalls:
    vi.fn<(creds: AppStoreConnectCredentials | undefined) => Promise<MetricResult<number>>>(),
  fetchGooglePlayInstalls:
    vi.fn<
      (creds: GooglePlayCredentials | undefined, packageId: string) => Promise<MetricResult<number>>
    >(),
  fetchCountrySplit:
    vi.fn<(creds: PostHogCredentials | undefined) => Promise<MetricResult<NamedCount[]>>>(),
}))
vi.mock('./sources/app-store-connect', () => ({
  fetchAppStoreInstalls: sources.fetchAppStoreInstalls,
}))
vi.mock('./sources/google-play', () => ({fetchGooglePlayInstalls: sources.fetchGooglePlayInstalls}))
vi.mock('./sources/posthog', () => ({fetchCountrySplit: sources.fetchCountrySplit}))

const DEFAULTS = {
  questionsAnswered: {total: 100, thisWeek: 10},
  platformCounts: [{platform: 'web' as const, count: 100}],
  answerTimestamps: [{createdAt: new Date('2026-01-05T00:00:00Z')}],
  activeDevices: {total: 50, last30Days: 20},
  decksPlayed: {total: 3},
  languageRows: [{name: 'en', count: 10}],
  liveEvents: {total: 0, thisWeek: 0},
  liveEventTimestamps: [] as {createdAt: Date}[],
  dataSince: {date: '2026-01-01'},
}

beforeEach(() => {
  for (const key of Object.keys(envMock)) {
    if (key !== 'PUBLIC_POSTHOG_UI_HOST') envMock[key] = undefined
  }
  vi.clearAllMocks()
  query.getQuestionsAnswered.mockResolvedValue(DEFAULTS.questionsAnswered)
  query.getPlatformCounts.mockResolvedValue(DEFAULTS.platformCounts)
  query.getAnswerTimestamps.mockResolvedValue(DEFAULTS.answerTimestamps)
  query.getActiveDevices.mockResolvedValue(DEFAULTS.activeDevices)
  query.getDecksPlayed.mockResolvedValue(DEFAULTS.decksPlayed)
  query.getLanguageCounts.mockResolvedValue(DEFAULTS.languageRows)
  query.getLiveEvents.mockResolvedValue(DEFAULTS.liveEvents)
  query.getLiveEventTimestamps.mockResolvedValue(DEFAULTS.liveEventTimestamps)
  query.getDataSince.mockResolvedValue(DEFAULTS.dataSince)
  sources.fetchAppStoreInstalls.mockResolvedValue({
    status: 'needs-credentials',
    source: 'app-store-connect',
  })
  sources.fetchGooglePlayInstalls.mockResolvedValue({
    status: 'needs-credentials',
    source: 'google-play',
  })
  sources.fetchCountrySplit.mockResolvedValue({status: 'needs-credentials', source: 'posthog'})
})

const freshIndex = async () => {
  vi.resetModules()
  return import('./index')
}

describe('getStatsSnapshot — live events folded into the hero total and weekly trend', () => {
  it('sums Live events into questionsAnswered rather than keeping them siloed', async () => {
    query.getQuestionsAnswered.mockResolvedValue({total: 100, thisWeek: 10})
    query.getLiveEvents.mockResolvedValue({total: 7, thisWeek: 2})
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.questionsAnswered).toMatchObject({
      status: 'live',
      value: {total: 107, thisWeek: 12},
    })
  })

  it('merges Live-event timestamps into the weekly trend so an event spike can show', async () => {
    // Both land "now" (same week) so the result is a single point regardless
    // of which real week the suite happens to run in.
    const now = new Date()
    query.getAnswerTimestamps.mockResolvedValue([{createdAt: now}])
    query.getLiveEventTimestamps.mockResolvedValue([{createdAt: now}])
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.weeklyTrend).toMatchObject({
      status: 'live',
      value: [expect.objectContaining({count: 2})],
    })
  })
})

describe('getStatsSnapshot — installs are decoupled per store', () => {
  it('keeps a live iOS result even when Android is unavailable, and vice versa', async () => {
    sources.fetchAppStoreInstalls.mockResolvedValue({
      status: 'live',
      value: 42,
      source: 'app-store-connect',
    })
    sources.fetchGooglePlayInstalls.mockResolvedValue({
      status: 'unavailable',
      source: 'google-play',
      reason: 'Cloud Storage returned 500',
    })
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.installsIos).toEqual({
      status: 'live',
      value: {count: 42},
      source: 'app-store-connect',
    })
    expect(snapshot.installsAndroid.status).toBe('unavailable')
  })
})

describe('getStatsSnapshot — credential completeness is checked exactly once', () => {
  it('passes undefined (not a partially-filled object) to fetchAppStoreInstalls when a field is missing', async () => {
    envMock.APP_STORE_CONNECT_KEY_ID = 'kid'
    envMock.APP_STORE_CONNECT_ISSUER_ID = 'iss'
    envMock.APP_STORE_CONNECT_PRIVATE_KEY = undefined // missing
    envMock.APP_STORE_CONNECT_VENDOR_NUMBER = '123'
    const {getStatsSnapshot} = await freshIndex()
    await getStatsSnapshot()
    expect(sources.fetchAppStoreInstalls).toHaveBeenCalledWith(undefined)
  })

  it('passes a complete credentials object through when every field is set', async () => {
    envMock.APP_STORE_CONNECT_KEY_ID = 'kid'
    envMock.APP_STORE_CONNECT_ISSUER_ID = 'iss'
    envMock.APP_STORE_CONNECT_PRIVATE_KEY = 'pk'
    envMock.APP_STORE_CONNECT_VENDOR_NUMBER = '123'
    const {getStatsSnapshot} = await freshIndex()
    await getStatsSnapshot()
    expect(sources.fetchAppStoreInstalls).toHaveBeenCalledWith({
      keyId: 'kid',
      issuerId: 'iss',
      privateKey: 'pk',
      vendorNumber: '123',
    })
  })
})

describe('getStatsSnapshot — PostHog credentials use the app/UI host, not the ingestion host', () => {
  it('builds the PostHog credentials with PUBLIC_POSTHOG_UI_HOST', async () => {
    envMock.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    envMock.POSTHOG_PROJECT_ID = '123'
    const {getStatsSnapshot} = await freshIndex()
    await getStatsSnapshot()
    expect(sources.fetchCountrySplit).toHaveBeenCalledWith({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://eu.posthog.com',
    })
  })
})
