/**
 * Orchestrates the public stats page's `StatsSnapshot`: combines first-party
 * Postgres aggregates (./query.ts) with this package's pure rollups (./rollups.ts)
 * and its three external source clients (App Store Connect, Google Play, PostHog —
 * country split only; see ./sources). This module is the one place that reads
 * `~env` and turns it into the credential objects those clients expect — and the
 * *only* place credential completeness is checked (each field present, JSON
 * parses, etc.); the source modules themselves only distinguish "no credentials"
 * from "have them," so that check exists exactly once.
 *
 * Cached in-memory (module-level) for `CACHE_TTL_MS` so a public page with no
 * per-visitor auth doesn't run these aggregate queries — or, worse, hit three
 * third-party APIs — on every request. Paired with the Netlify CDN
 * `Cache-Control` / `Netlify-CDN-Cache-Control` headers set in stats.astro (the
 * same "5 min browser / 1 hr CDN / 24 hr stale-while-revalidate" shape already
 * used by [trpc].ts).
 */
import {ANDROID_PACKAGE_ID} from '@whocards/app-store'
import {LANGUAGE_CODES} from '@whocards/decks'
import {env} from '~env'
import {db} from '~server/db'
import {
  getActiveDevices,
  getAnswerTimestamps,
  getDataSince,
  getDecksPlayed,
  getLanguageCounts,
  getLiveEventTimestamps,
  getLiveEvents,
  getPlatformCounts,
  getQuestionsAnswered,
} from './query'
import {applyPrivacyThreshold, platformBreakdown, weeklyTrend} from './rollups'
import type {AppStoreConnectCredentials} from './sources/app-store-connect'
import {fetchAppStoreInstalls} from './sources/app-store-connect'
import type {GooglePlayCredentials} from './sources/google-play'
import {fetchGooglePlayInstalls} from './sources/google-play'
import type {PostHogCredentials} from './sources/posthog'
import {fetchCountrySplit} from './sources/posthog'
import type {StatsSnapshot} from './types'
import {live, unavailable} from './types'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — matches the page's Cache-Control max-age.

let cache: {snapshot: StatsSnapshot; expiresAt: number} | undefined

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
    // Malformed JSON in the env var — treat exactly like "not configured" rather
    // than throwing out of a credentials getter.
    return undefined
  }
}

const postHogCredentials = (): PostHogCredentials | undefined => {
  const {POSTHOG_PERSONAL_API_KEY: personalApiKey, POSTHOG_PROJECT_ID: projectId} = env
  if (!personalApiKey || !projectId) return undefined
  // The HogQL query endpoint lives on the PostHog app/UI host, not the
  // ingestion proxy client SDKs post events to (PUBLIC_POSTHOG_HOST is
  // who.whocards.cc, which doesn't serve /api/projects/:id/query/).
  return {personalApiKey, projectId, host: env.PUBLIC_POSTHOG_UI_HOST}
}

/** Builds a fresh `StatsSnapshot`, bypassing the cache. */
const buildStatsSnapshot = async (): Promise<StatsSnapshot> => {
  const [
    questionsAnswered,
    platformRows,
    answerTimestamps,
    activeDevices,
    decksPlayed,
    languageRows,
    liveEvents,
    liveEventTimestamps,
    installsIos,
    installsAndroid,
    countries,
    dataSince,
  ] = await Promise.all([
    getQuestionsAnswered(db),
    getPlatformCounts(db),
    getAnswerTimestamps(db),
    getActiveDevices(db),
    getDecksPlayed(db),
    getLanguageCounts(db),
    getLiveEvents(db),
    getLiveEventTimestamps(db),
    fetchAppStoreInstalls(appStoreConnectCredentials()),
    fetchGooglePlayInstalls(googlePlayCredentials(), ANDROID_PACKAGE_ID),
    fetchCountrySplit(postHogCredentials()),
    getDataSince(db),
  ])

  const spokenLanguages = applyPrivacyThreshold(languageRows)

  return {
    // Live events are the same Answer concept in its event-scoped form
    // (CONTEXT.md), so they're summed into the hero total/weekly badge here
    // rather than kept as an entirely separate metric.
    questionsAnswered: live(
      {
        total: questionsAnswered.total + liveEvents.total,
        thisWeek: questionsAnswered.thisWeek + liveEvents.thisWeek,
      },
      'postgres:answer+conference_question_tracking'
    ),
    platformBreakdown: live(platformBreakdown(platformRows), 'postgres:answer'),
    weeklyTrend: live(
      weeklyTrend([...answerTimestamps, ...liveEventTimestamps]),
      'postgres:answer+conference_question_tracking'
    ),
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
    // Each install source is its own field (not one combined result) so App
    // Store being unavailable never hides a live Google Play number, and
    // vice versa — see StatsSnapshot's doc comment in ./types.
    installsIos:
      installsIos.status === 'live'
        ? live({count: installsIos.value}, installsIos.source)
        : installsIos,
    installsAndroid:
      installsAndroid.status === 'live'
        ? live({count: installsAndroid.value}, installsAndroid.source)
        : installsAndroid,
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
