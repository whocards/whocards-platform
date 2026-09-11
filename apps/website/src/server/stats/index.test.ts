import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {AppStoreConnectCredentials} from './sources/app-store-connect'
import type {GooglePlayCredentials} from './sources/google-play'
import type {AnswerTimestampRow, MetricResult, NamedCount, PlatformCountRow} from './types'

// freshIndex() re-imports ./index so its module-level cache doesn't leak between tests.

const envMock: Record<string, string | undefined> = {
  APP_STORE_CONNECT_KEY_ID: undefined,
  APP_STORE_CONNECT_ISSUER_ID: undefined,
  APP_STORE_CONNECT_PRIVATE_KEY: undefined,
  APP_STORE_CONNECT_VENDOR_NUMBER: undefined,
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: undefined,
  GOOGLE_PLAY_REPORTS_BUCKET: undefined,
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
  getCountryCounts: vi.fn<() => Promise<NamedCount[]>>(),
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
}))
vi.mock('./sources/app-store-connect', () => ({
  fetchAppStoreInstalls: sources.fetchAppStoreInstalls,
}))
vi.mock('./sources/google-play', () => ({fetchGooglePlayInstalls: sources.fetchGooglePlayInstalls}))

const DEFAULTS = {
  questionsAnswered: {total: 100, thisWeek: 10},
  platformCounts: [{platform: 'web' as const, count: 100}],
  answerTimestamps: [{createdAt: new Date('2026-01-05T00:00:00Z')}],
  activeDevices: {total: 50, last30Days: 20},
  decksPlayed: {total: 3},
  languageRows: [{name: 'en', count: 10}],
  countryRows: [{name: 'HU', count: 12}],
  dataSince: {date: '2026-01-01'},
}

beforeEach(() => {
  for (const key of Object.keys(envMock)) envMock[key] = undefined
  vi.clearAllMocks()
  query.getQuestionsAnswered.mockResolvedValue(DEFAULTS.questionsAnswered)
  query.getPlatformCounts.mockResolvedValue(DEFAULTS.platformCounts)
  query.getAnswerTimestamps.mockResolvedValue(DEFAULTS.answerTimestamps)
  query.getActiveDevices.mockResolvedValue(DEFAULTS.activeDevices)
  query.getDecksPlayed.mockResolvedValue(DEFAULTS.decksPlayed)
  query.getLanguageCounts.mockResolvedValue(DEFAULTS.languageRows)
  query.getCountryCounts.mockResolvedValue(DEFAULTS.countryRows)
  query.getDataSince.mockResolvedValue(DEFAULTS.dataSince)
  sources.fetchAppStoreInstalls.mockResolvedValue({
    status: 'needs-credentials',
    source: 'app-store-connect',
  })
  sources.fetchGooglePlayInstalls.mockResolvedValue({
    status: 'needs-credentials',
    source: 'google-play',
  })
})

const freshIndex = async () => {
  vi.resetModules()
  return import('./index')
}

describe('getStatsSnapshot — questions answered come from the Answer record only', () => {
  it('does not add conference tracking rows to the hero total', async () => {
    query.getQuestionsAnswered.mockResolvedValue({total: 100, thisWeek: 10})
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.questionsAnswered).toMatchObject({
      status: 'live',
      value: {total: 100, thisWeek: 10},
      source: 'postgres:answer',
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

describe('getStatsSnapshot — countries come from the Answer record, privacy-thresholded', () => {
  it('drops countries backed by fewer than 5 devices before they reach the page', async () => {
    query.getCountryCounts.mockResolvedValue([
      {name: 'HU', count: 12},
      {name: 'AT', count: 4},
    ])
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.countries).toEqual({
      status: 'live',
      value: [{name: 'HU', count: 12}],
      source: 'postgres:answer',
    })
  })
})

describe('getStatsSnapshot — one failing DB query degrades only its own field(s)', () => {
  it('degrades only activeDevices to unavailable when its query rejects, leaving every other field live', async () => {
    query.getActiveDevices.mockRejectedValue(new Error('connection terminated'))
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.activeDevices).toMatchObject({
      status: 'unavailable',
      reason: 'connection terminated',
    })
    expect(snapshot.decksPlayed.status).toBe('live')
    expect(snapshot.platformBreakdown.status).toBe('live')
    expect(snapshot.languages.status).toBe('live')
  })

  it('degrades weeklyTrend to unavailable when the timestamp query fails', async () => {
    query.getAnswerTimestamps.mockRejectedValue(new Error('timeout'))
    const {getStatsSnapshot} = await freshIndex()
    const snapshot = await getStatsSnapshot()
    expect(snapshot.weeklyTrend.status).toBe('unavailable')
    expect(snapshot.questionsAnswered.status).toBe('live')
  })
})

describe('getStatsSnapshot — concurrent cache-miss callers share one in-flight build', () => {
  it('calls the underlying query only once for two concurrent callers, and returns the same snapshot', async () => {
    const {getStatsSnapshot} = await freshIndex()
    const [first, second] = await Promise.all([getStatsSnapshot(), getStatsSnapshot()])
    expect(query.getQuestionsAnswered).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('clears the in-flight promise on rejection, so a subsequent call retries rather than replaying the failure', async () => {
    sources.fetchAppStoreInstalls
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({status: 'needs-credentials', source: 'app-store-connect'})
    const {getStatsSnapshot} = await freshIndex()
    await expect(getStatsSnapshot()).rejects.toThrow('boom')
    const snapshot = await getStatsSnapshot()
    expect(snapshot.installsIos.status).toBe('needs-credentials')
  })
})
