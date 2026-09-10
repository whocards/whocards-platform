/**
 * Orchestrates the public stats page's `StatsSnapshot`: combines first-party
 * Postgres aggregates (./query.ts) with @whocards/analytics's pure rollups and
 * its three external source clients (App Store Connect, Google Play, PostHog —
 * country split only). This module is the one place that reads `env.ts` and
 * turns it into the credential objects those clients expect; the clients
 * themselves never read `process.env` (see @whocards/analytics's source files).
 *
 * Cached in-memory (module-level) for `CACHE_TTL_MS` so a public page with no
 * per-visitor auth doesn't run these aggregate queries — or, worse, hit three
 * third-party APIs — on every request. Paired with the Netlify CDN
 * `Cache-Control` header set in stats.astro (the same "5 min browser / 1 hr CDN
 * / 24 hr stale-while-revalidate" shape already used by [trpc].ts).
 */
import {ANDROID_PACKAGE_ID} from '@whocards/app-store'
import type {StatsSnapshot} from '@whocards/analytics'
import {
  applyPrivacyThreshold,
  live,
  needsCredentials,
  platformBreakdown,
  unavailable,
  weeklyTrend,
} from '@whocards/analytics'
import {fetchAppStoreInstalls} from '@whocards/analytics/sources/app-store-connect'
import {fetchGooglePlayInstalls} from '@whocards/analytics/sources/google-play'
import {fetchCountrySplit} from '@whocards/analytics/sources/posthog'
import {LANGUAGE_CODES} from '@whocards/decks'
import {env} from '~env'
import {db} from '../db'
import {
  getActiveDevices,
  getAnswerTimestamps,
  getDataSince,
  getDecksPlayed,
  getLanguageCounts,
  getLiveEventsTotal,
  getPlatformCounts,
  getQuestionsAsked,
} from './query'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — matches the page's Cache-Control max-age.

let cache: {snapshot: StatsSnapshot; expiresAt: number} | undefined

const appStoreConnectCredentials = () => {
  const {
    APP_STORE_CONNECT_KEY_ID: keyId,
    APP_STORE_CONNECT_ISSUER_ID: issuerId,
    APP_STORE_CONNECT_PRIVATE_KEY: privateKey,
    APP_STORE_CONNECT_VENDOR_NUMBER: vendorNumber,
  } = env
  if (!keyId || !issuerId || !privateKey || !vendorNumber) return undefined
  return {keyId, issuerId, privateKey, vendorNumber}
}

/** Narrows an already-parsed JSON value to the two fields we need, without an unsafe cast. */
const isServiceAccountShape = (
  value: unknown
): value is {client_email: string; private_key: string} =>
  typeof value === 'object' &&
  value !== null &&
  'client_email' in value &&
  'private_key' in value &&
  typeof value.client_email === 'string' &&
  typeof value.private_key === 'string'

const googlePlayCredentials = () => {
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
    // Malformed JSON in the env var — treat exactly like "not configured" rather
    // than throwing out of a credentials getter.
    return undefined
  }
}

const postHogCredentials = () => {
  const {POSTHOG_PERSONAL_API_KEY: personalApiKey, POSTHOG_PROJECT_ID: projectId} = env
  if (!personalApiKey || !projectId) return undefined
  return {personalApiKey, projectId, host: env.PUBLIC_POSTHOG_HOST}
}

/** Builds a fresh `StatsSnapshot`, bypassing the cache. Exported for tests. */
export const buildStatsSnapshot = async (): Promise<StatsSnapshot> => {
  const [
    questionsAsked,
    platformRows,
    answerTimestamps,
    activeDevices,
    decksPlayed,
    languageRows,
    liveEvents,
    installsIos,
    installsAndroid,
    countries,
    dataSince,
  ] = await Promise.all([
    getQuestionsAsked(db),
    getPlatformCounts(db),
    getAnswerTimestamps(db),
    getActiveDevices(db),
    getDecksPlayed(db),
    getLanguageCounts(db),
    getLiveEventsTotal(db),
    fetchAppStoreInstalls(appStoreConnectCredentials()),
    fetchGooglePlayInstalls(googlePlayCredentials(), ANDROID_PACKAGE_ID),
    fetchCountrySplit(postHogCredentials()),
    getDataSince(db),
  ])

  const spokenLanguages = applyPrivacyThreshold(languageRows)

  const installs =
    installsIos.status === 'live' && installsAndroid.status === 'live'
      ? live(
          {ios: installsIos.value, android: installsAndroid.value},
          'app-store-connect+google-play'
        )
      : installsIos.status === 'needs-credentials' && installsAndroid.status === 'needs-credentials'
        ? needsCredentials('app-store-connect+google-play', 'no install source is configured')
        : unavailable(
            'app-store-connect+google-play',
            'one or both install sources are unavailable — see individual source results'
          )

  return {
    generatedAt: new Date().toISOString(),
    questionsAsked: live(questionsAsked, 'postgres:answer'),
    platformBreakdown: live(platformBreakdown(platformRows), 'postgres:answer'),
    weeklyTrend: live(weeklyTrend(answerTimestamps), 'postgres:answer'),
    liveEvents: live(liveEvents, 'postgres:conference_question_tracking'),
    activeDevices: live(activeDevices, 'postgres:answer'),
    decksPlayed: live(decksPlayed, 'postgres:answer'),
    languages: live(
      {spoken: spokenLanguages.length, ofTotal: LANGUAGE_CODES.length},
      'postgres:answer'
    ),
    countries:
      countries.status === 'live'
        ? live(applyPrivacyThreshold(countries.value), 'posthog')
        : countries,
    installs,
    dataSince: dataSince
      ? live(dataSince, 'postgres:answer')
      : unavailable('postgres:answer', 'no answers recorded yet'),
  }
}

/** Cached accessor — the one the page should call. */
export const getStatsSnapshot = async (): Promise<StatsSnapshot> => {
  if (cache && cache.expiresAt > Date.now()) return cache.snapshot
  const snapshot = await buildStatsSnapshot()
  cache = {snapshot, expiresAt: Date.now() + CACHE_TTL_MS}
  return snapshot
}
