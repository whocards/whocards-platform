import {ANDROID_PACKAGE_ID} from '@whocards/app-store'
import {LANGUAGE_CODES} from '@whocards/decks'
import {env} from '~env'
import {db} from '~server/db'
import {
  getActiveDevices,
  getAnswerTimestamps,
  getCountryCounts,
  getDataSince,
  getDecksPlayed,
  getLanguageCounts,
  getPlatformCounts,
  getQuestionsAnswered,
} from './query'
import {applyPrivacyThreshold, platformBreakdown, weeklyTrend} from './rollups'
import type {AppStoreConnectCredentials} from './sources/app-store-connect'
import {fetchAppStoreInstalls} from './sources/app-store-connect'
import type {GooglePlayCredentials} from './sources/google-play'
import {fetchGooglePlayInstalls} from './sources/google-play'
import type {StatsSnapshot} from './types'
import {live, unavailable} from './types'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — matches the page's Cache-Control max-age.

let cache: {snapshot: StatsSnapshot; expiresAt: number} | undefined
/** Shared by concurrent cache misses, so a cold cache triggers one rebuild instead of one per request. */
let inFlight: Promise<StatsSnapshot> | undefined

const appStoreConnectCredentials = (): AppStoreConnectCredentials | undefined => {
  const {
    APP_STORE_CONNECT_KEY_ID: keyId,
    APP_STORE_CONNECT_ISSUER_ID: issuerId,
    APP_STORE_CONNECT_PRIVATE_KEY: privateKey,
    APP_STORE_CONNECT_VENDOR_NUMBER: vendorNumber,
  } = env
  if (!keyId || !issuerId || !privateKey || !vendorNumber) return undefined
  return {keyId, issuerId, privateKey, vendorNumber}
}

const isServiceAccountShape = (
  value: unknown
): value is {client_email: string; private_key: string} =>
  typeof value === 'object' &&
  value !== null &&
  'client_email' in value &&
  'private_key' in value &&
  typeof value.client_email === 'string' &&
  typeof value.private_key === 'string'

const googlePlayCredentials = (): GooglePlayCredentials | undefined => {
  const {GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: json, GOOGLE_PLAY_REPORTS_BUCKET: bucket} = env
  if (!json || !bucket) return undefined
  try {
    const parsed: unknown = JSON.parse(json)
    if (!isServiceAccountShape(parsed)) return undefined
    return {
      serviceAccount: {client_email: parsed.client_email, private_key: parsed.private_key},
      bucket,
    }
  } catch {
    return undefined
  }
}

type DbResult<T> = {ok: true; value: T} | {ok: false; error: unknown}

const runDbQuery = async <T>(fn: () => Promise<T>): Promise<DbResult<T>> => {
  try {
    return {ok: true, value: await fn()}
  } catch (error) {
    return {ok: false, error}
  }
}

const dbFailureReason = (...results: DbResult<unknown>[]): string => {
  const failed = results.find((result): result is {ok: false; error: unknown} => !result.ok)
  return failed?.error instanceof Error ? failed.error.message : 'unknown error'
}

const buildStatsSnapshot = async (): Promise<StatsSnapshot> => {
  const now = new Date()

  const [
    questionsAnswered,
    platformRows,
    answerTimestamps,
    activeDevices,
    decksPlayed,
    languageRows,
    countryRows,
    installsIos,
    installsAndroid,
    dataSince,
  ] = await Promise.all([
    runDbQuery(() => getQuestionsAnswered(db, now)),
    runDbQuery(() => getPlatformCounts(db)),
    runDbQuery(() => getAnswerTimestamps(db)),
    runDbQuery(() => getActiveDevices(db)),
    runDbQuery(() => getDecksPlayed(db)),
    runDbQuery(() => getLanguageCounts(db)),
    runDbQuery(() => getCountryCounts(db)),
    fetchAppStoreInstalls(appStoreConnectCredentials()),
    fetchGooglePlayInstalls(googlePlayCredentials(), ANDROID_PACKAGE_ID),
    runDbQuery(() => getDataSince(db)),
  ])

  const spokenLanguages = languageRows.ok ? applyPrivacyThreshold(languageRows.value) : []

  return {
    // Answer record only. Live events (conference tracking) aren't counted until
    // they fold into the Answer record — today they can't be attributed or de-duplicated.
    questionsAnswered: questionsAnswered.ok
      ? live(questionsAnswered.value, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(questionsAnswered)),
    platformBreakdown: platformRows.ok
      ? live(platformBreakdown(platformRows.value), 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(platformRows)),
    weeklyTrend: answerTimestamps.ok
      ? live(weeklyTrend(answerTimestamps.value, now), 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(answerTimestamps)),
    activeDevices: activeDevices.ok
      ? live(activeDevices.value, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(activeDevices)),
    decksPlayed: decksPlayed.ok
      ? live(decksPlayed.value, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(decksPlayed)),
    languages: languageRows.ok
      ? live({spoken: spokenLanguages.length, ofTotal: LANGUAGE_CODES.length}, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(languageRows)),
    countries: countryRows.ok
      ? live(applyPrivacyThreshold(countryRows.value), 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(countryRows)),
    installsIos:
      installsIos.status === 'live'
        ? live({count: installsIos.value}, installsIos.source)
        : installsIos,
    installsAndroid:
      installsAndroid.status === 'live'
        ? live({count: installsAndroid.value}, installsAndroid.source)
        : installsAndroid,
    dataSince: dataSince.ok
      ? dataSince.value
        ? live(dataSince.value, 'postgres:answer')
        : unavailable('postgres:answer', 'no answers recorded yet')
      : unavailable('postgres:answer', dbFailureReason(dataSince)),
  }
}

export const getStatsSnapshot = async (): Promise<StatsSnapshot> => {
  if (cache && cache.expiresAt > Date.now()) return cache.snapshot
  if (inFlight) return inFlight

  inFlight = buildStatsSnapshot()
    .then((snapshot) => {
      cache = {snapshot, expiresAt: Date.now() + CACHE_TTL_MS}
      return snapshot
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}
