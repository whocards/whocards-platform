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
/**
 * The in-progress `buildStatsSnapshot()` call, shared across concurrent
 * cache-miss callers so a burst of requests when the cache is cold (or has
 * just expired) triggers exactly one rebuild instead of one per request.
 * Cleared on both settle paths (see `getStatsSnapshot`) — in particular on
 * rejection, so a failed build isn't stuck as "the" pending promise for
 * every caller after it; the next call retries from scratch.
 */
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

/** A DB query's outcome, kept alongside its error rather than thrown, so one failing query doesn't reject the whole `Promise.all` batch. */
type DbResult<T> = {ok: true; value: T} | {ok: false; error: unknown}

/** Runs a DB query, capturing a rejection instead of letting it propagate. */
const runDbQuery = async <T>(fn: () => Promise<T>): Promise<DbResult<T>> => {
  try {
    return {ok: true, value: await fn()}
  } catch (error) {
    return {ok: false, error}
  }
}

/** The first failed result's message, for an `unavailable` reason string. */
const dbFailureReason = (...results: DbResult<unknown>[]): string => {
  const failed = results.find((result): result is {ok: false; error: unknown} => !result.ok)
  return failed?.error instanceof Error ? failed.error.message : 'unknown error'
}

/**
 * Builds a fresh `StatsSnapshot`, bypassing the cache. Every Postgres
 * aggregate is run through `runDbQuery` so one failing query degrades only
 * the field(s) that depend on it to `unavailable`, the same way the external
 * sources (App Store Connect, Google Play, PostHog) already degrade
 * independently — a single DB hiccup must not fail the whole page render.
 */
const buildStatsSnapshot = async (): Promise<StatsSnapshot> => {
  // One `now` shared by every "this week"/"current week" calculation in this
  // build, so the hero's "this week" badge and the weekly chart's current-
  // week bar always agree on which week "this week" is — even though they're
  // computed by separate queries/rollups.
  const now = new Date()

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
    runDbQuery(() => getQuestionsAnswered(db, now)),
    runDbQuery(() => getPlatformCounts(db)),
    runDbQuery(() => getAnswerTimestamps(db)),
    runDbQuery(() => getActiveDevices(db)),
    runDbQuery(() => getDecksPlayed(db)),
    runDbQuery(() => getLanguageCounts(db)),
    runDbQuery(() => getLiveEvents(db, now)),
    runDbQuery(() => getLiveEventTimestamps(db)),
    fetchAppStoreInstalls(appStoreConnectCredentials()),
    fetchGooglePlayInstalls(googlePlayCredentials(), ANDROID_PACKAGE_ID),
    fetchCountrySplit(postHogCredentials()),
    runDbQuery(() => getDataSince(db)),
  ])

  const spokenLanguages = languageRows.ok ? applyPrivacyThreshold(languageRows.value) : []

  return {
    // Live events are the same Answer concept in its event-scoped form
    // (CONTEXT.md), so they're summed into the hero total/weekly badge here
    // rather than kept as an entirely separate metric — which also means
    // either query failing must degrade the combined field, not silently
    // sum in a 0 for the half that failed.
    questionsAnswered:
      questionsAnswered.ok && liveEvents.ok
        ? live(
            {
              total: questionsAnswered.value.total + liveEvents.value.total,
              thisWeek: questionsAnswered.value.thisWeek + liveEvents.value.thisWeek,
            },
            'postgres:answer+conference_question_tracking'
          )
        : unavailable(
            'postgres:answer+conference_question_tracking',
            dbFailureReason(questionsAnswered, liveEvents)
          ),
    platformBreakdown: platformRows.ok
      ? live(platformBreakdown(platformRows.value), 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(platformRows)),
    weeklyTrend:
      answerTimestamps.ok && liveEventTimestamps.ok
        ? live(
            weeklyTrend([...answerTimestamps.value, ...liveEventTimestamps.value], now),
            'postgres:answer+conference_question_tracking'
          )
        : unavailable(
            'postgres:answer+conference_question_tracking',
            dbFailureReason(answerTimestamps, liveEventTimestamps)
          ),
    liveEvents: liveEvents.ok
      ? live(liveEvents.value, 'postgres:conference_question_tracking')
      : unavailable('postgres:conference_question_tracking', dbFailureReason(liveEvents)),
    activeDevices: activeDevices.ok
      ? live(activeDevices.value, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(activeDevices)),
    decksPlayed: decksPlayed.ok
      ? live(decksPlayed.value, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(decksPlayed)),
    languages: languageRows.ok
      ? live({spoken: spokenLanguages.length, ofTotal: LANGUAGE_CODES.length}, 'postgres:answer')
      : unavailable('postgres:answer', dbFailureReason(languageRows)),
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
    dataSince: dataSince.ok
      ? dataSince.value
        ? live(dataSince.value, 'postgres:answer')
        : unavailable('postgres:answer', 'no answers recorded yet')
      : unavailable('postgres:answer', dbFailureReason(dataSince)),
  }
}

/**
 * Cached accessor — the one the page should call. A cache miss shares one
 * `buildStatsSnapshot()` call across every concurrent caller (`inFlight`)
 * rather than letting each request kick off its own rebuild — a burst of
 * traffic right as the 5-minute TTL expires must not fan out into a burst of
 * duplicate DB/API load. Cleared on both success and rejection so a failed
 * build never lingers as the (incorrectly) "current" in-flight promise for
 * requests that arrive after it settles.
 */
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
