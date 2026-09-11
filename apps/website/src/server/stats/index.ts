import {ANDROID_PACKAGE_ID} from '@whocards/app-store'
import {LANGUAGE_CODES} from '@whocards/decks'
import {env} from '~env'
import {db} from '~server/db'
import {
  getAnswerTotals,
  getCountryCounts,
  getLanguageCounts,
  getMonthlyCounts,
  getPlatformCounts,
  getWeeklyCounts,
} from './query'
import {applyPrivacyThreshold, buildTrend, platformBreakdown} from './rollups'
import {readLatestSnapshot, writeSnapshot} from './snapshot-store'
import type {AppStoreConnectCredentials} from './sources/app-store-connect'
import {fetchAppStoreInstalls} from './sources/app-store-connect'
import type {GooglePlayCredentials} from './sources/google-play'
import {fetchGooglePlayInstalls} from './sources/google-play'
import type {StatsSnapshot} from './types'
import {live, unavailable} from './types'

/**
 * The scheduled refresh runs hourly. A stored snapshot older than this means the cron is
 * broken, so the page rebuilds inline (and stores the result) rather than serving stale data.
 */
export const MAX_SNAPSHOT_AGE_MS = 3 * 60 * 60 * 1000

/** Shared by concurrent inline rebuilds, so a missing snapshot triggers one build instead of one per request. */
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
    totals,
    platformRows,
    weekRows,
    monthRows,
    languageRows,
    countryRows,
    installsIos,
    installsAndroid,
  ] = await Promise.all([
    runDbQuery(() => getAnswerTotals(db, now)),
    runDbQuery(() => getPlatformCounts(db)),
    runDbQuery(() => getWeeklyCounts(db, now)),
    runDbQuery(() => getMonthlyCounts(db)),
    runDbQuery(() => getLanguageCounts(db)),
    runDbQuery(() => getCountryCounts(db)),
    fetchAppStoreInstalls(appStoreConnectCredentials()),
    fetchGooglePlayInstalls(googlePlayCredentials(), ANDROID_PACKAGE_ID),
  ])

  const spokenLanguages = languageRows.ok ? applyPrivacyThreshold(languageRows.value) : []

  return {
    generatedAt: now.toISOString(),
    // Answer record only. Live events (conference tracking) aren't counted until
    // they fold into the Answer record — today they can't be attributed or de-duplicated.
    questionsAnswered: totals.ok
      ? live(
          {total: totals.value.answers, thisWeek: totals.value.answersThisWeek},
          'postgres:answer'
        )
      : unavailable('postgres:answer', dbFailureReason(totals)),
    platformBreakdown: platformRows.ok
      ? live(platformBreakdown(platformRows.value), 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(platformRows)),
    trend:
      weekRows.ok && monthRows.ok
        ? live(buildTrend(weekRows.value, monthRows.value, now), 'postgres:answer')
        : unavailable('postgres:answer', dbFailureReason(weekRows, monthRows)),
    activeDevices: totals.ok
      ? live(
          {total: totals.value.devices, last30Days: totals.value.devicesLast30Days},
          'postgres:answer'
        )
      : unavailable('postgres:answer', dbFailureReason(totals)),
    decksPlayed: totals.ok
      ? live({total: totals.value.decks}, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(totals)),
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
    dataSince: totals.ok
      ? totals.value.earliest
        ? live({date: totals.value.earliest}, 'postgres:answer')
        : unavailable('postgres:answer', 'no answers recorded yet')
      : unavailable('postgres:answer', dbFailureReason(totals)),
  }
}

/** Builds a fresh snapshot and stores it. Used by the scheduled refresh (POST /api/stats/refresh). */
export const refreshStatsSnapshot = async (): Promise<StatsSnapshot> => {
  const snapshot = await buildStatsSnapshot()
  await writeSnapshot(db, snapshot)
  return snapshot
}

const isFresh = (snapshot: StatsSnapshot, now: number): boolean =>
  now - Date.parse(snapshot.generatedAt) < MAX_SNAPSHOT_AGE_MS

/**
 * What the page renders: the newest stored snapshot (one small query). Falls back to an
 * inline build when there is none yet or it is stale; the inline build still stores its
 * result on a best-effort basis so the next request is cheap again.
 */
export const getStatsSnapshot = async (): Promise<StatsSnapshot> => {
  const stored = await readLatestSnapshot(db).catch(() => undefined)
  if (stored && isFresh(stored, Date.now())) return stored
  if (inFlight) return inFlight

  inFlight = buildStatsSnapshot()
    .then(async (snapshot) => {
      await writeSnapshot(db, snapshot).catch(() => undefined)
      return snapshot
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}
