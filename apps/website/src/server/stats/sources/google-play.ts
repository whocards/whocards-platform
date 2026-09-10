/**
 * Google Play installs, for the stats page's install-count metric. Env-gated
 * and dependency-injected, same shape as ./app-store-connect — no SDK
 * dependency (no `googleapis`), just `jsonwebtoken` for the service-account
 * bearer token and `fetch` for the Cloud Storage JSON API. Google Play's
 * install-count reports are CSV files Google drops daily into a
 * Play-managed Cloud Storage bucket, not a REST "give me a number" endpoint.
 *
 * Setup (full walkthrough in docs/STATS-ENV.md):
 * 1. Google Cloud Console → IAM & Admin → Service Accounts → create one (no
 *    Cloud roles needed) and add a JSON key.
 * 2. Play Console → Users and permissions → invite the service account's
 *    email with the "View app information and download bulk reports"
 *    account permission (needed to read the reports bucket; can take up to
 *    24h to propagate).
 * 3. Play Console → Download reports → Statistics → "Copy Cloud Storage URI"
 *    shows the bucket name (`pubsite_prod_rev_<digits>`) the account can read.
 * 4. `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` = the full downloaded JSON key file
 *    contents (stringified JSON — Netlify env vars support long values).
 *    `GOOGLE_PLAY_REPORTS_BUCKET` = the bucket name from step 3.
 *
 * Docs: https://developer.android.com/distribute/console/api-access,
 * https://support.google.com/googleplay/android-developer/answer/6135870
 * (statistics report format).
 */
import jwt from 'jsonwebtoken'

import type {MetricResult} from '../types'
import {live, needsCredentials, unavailable} from '../types'
import {reportWindowDates} from './report-window'

export type GooglePlayServiceAccount = {
  client_email: string
  private_key: string
}

export type GooglePlayCredentials = {
  /** Parsed service-account JSON (client_email + private_key). */
  serviceAccount: GooglePlayServiceAccount
  /** The `pubsite_prod_rev_*` Cloud Storage bucket Play Console shows under "Download reports". */
  bucket: string
}

const SOURCE = 'google-play'
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only'
const TOKEN_TTL_SECONDS = 60 * 60
const FETCH_TIMEOUT_MS = 10_000

/** Builds the RS256 JWT-bearer assertion Google's OAuth2 token endpoint expects. */
export const buildGooglePlayAssertion = (account: GooglePlayServiceAccount): string => {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      iss: account.client_email,
      scope: STORAGE_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    account.private_key,
    {algorithm: 'RS256'}
  )
}

/** Exchanges the signed assertion for a short-lived OAuth2 access token. */
const fetchAccessToken = async (account: GooglePlayServiceAccount): Promise<string> => {
  const assertion = buildGooglePlayAssertion(account)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google OAuth2 token exchange failed: ${response.status}`)
  const json: unknown = await response.json()
  const accessToken =
    typeof json === 'object' && json !== null && 'access_token' in json
      ? json.access_token
      : undefined
  if (typeof accessToken !== 'string')
    throw new Error('Google OAuth2 response missing access_token')
  return accessToken
}

/** `YYYYMM` for `date`, UTC — Google's month key in the report's object path. */
const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`

/** The first of the UTC calendar month immediately before `date`'s month. */
const previousMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))

/**
 * Fetches and parses one month's "installs overview" CSV. A 404 means Google
 * hasn't published a report for that month yet (e.g. the app is brand new, or
 * the current month just started) — treated as no rows, not an error. Any
 * other non-OK status throws, which the caller turns into `unavailable`.
 */
const fetchMonthlyInstallRows = async (
  creds: GooglePlayCredentials,
  accessToken: string,
  packageId: string,
  yyyymm: string
): Promise<InstallRow[]> => {
  const objectPath = `stats/installs/installs_${packageId}_${yyyymm}_overview.csv`
  const url = `https://storage.googleapis.com/storage/v1/b/${creds.bucket}/o/${encodeURIComponent(objectPath)}?alt=media`
  const response = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Cloud Storage returned ${response.status}`)
  // Google's overview CSVs are UTF-16LE with a BOM.
  const buffer = await response.arrayBuffer()
  const csv = new TextDecoder('utf-16le').decode(buffer)
  return parseInstallsOverviewRows(csv)
}

/**
 * Total Android installs over the trailing 30 days, read from Google's
 * "installs" statistics CSVs at `stats/installs/installs_<package>_<YYYYMM>_overview.csv`
 * (Google's fixed path convention — one file per calendar month, one row per
 * day within it). A trailing 30-day window can span a month boundary, so both
 * the current month's and the immediately preceding month's reports are
 * fetched and their rows filtered down to the same window
 * `./report-window.ts` gives the App Store source, keeping both stores'
 * "last 30 days" label honest and directly comparable. Returns
 * `needs-credentials` when unset, `unavailable` (never throws) on a
 * fetch/parse failure. `now` is injectable so tests can exercise a window
 * that crosses a month boundary without depending on real wall-clock time.
 */
export const fetchGooglePlayInstalls = async (
  creds: GooglePlayCredentials | undefined,
  packageId: string,
  now: Date = new Date()
): Promise<MetricResult<number>> => {
  // Field-by-field completeness is the caller's job (apps/website's
  // `googlePlayCredentials()` builds this object only when both env vars are
  // set and the JSON parses to the expected shape) — checking again here
  // would duplicate that check, so this module only distinguishes "no
  // credentials at all" from "have them."
  if (!creds) {
    return needsCredentials(
      SOURCE,
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_REPORTS_BUCKET not set'
    )
  }

  try {
    const accessToken = await fetchAccessToken(creds.serviceAccount)
    const [currentMonthRows, priorMonthRows] = await Promise.all([
      fetchMonthlyInstallRows(creds, accessToken, packageId, monthKey(now)),
      fetchMonthlyInstallRows(creds, accessToken, packageId, monthKey(previousMonth(now))),
    ])
    const windowDates = new Set(reportWindowDates(now))
    const installs = [...currentMonthRows, ...priorMonthRows]
      .filter((row) => windowDates.has(row.date))
      .reduce((total, row) => total + row.count, 0)
    return live(installs, SOURCE)
  } catch (error) {
    return unavailable(SOURCE, error instanceof Error ? error.message : 'unknown error')
  }
}

export type InstallRow = {date: string; count: number}

/**
 * Parses Google's "installs overview" CSV into one row per day. Exported
 * (pure, no fetch) so parsing is unit-testable against a fixture. Column
 * names per Google's documented format: "Date" (`YYYY-MM-DD`) and "Daily User
 * Installs" (net new installs for that day). Throws if either column is
 * missing rather than silently summing to 0 — a malformed/unexpected report
 * must show as `unavailable`, never a false live number.
 */
export const parseInstallsOverviewRows = (csv: string): InstallRow[] => {
  const lines = csv.trim().split('\n')
  const [headerLine, ...rows] = lines
  if (!headerLine) {
    throw new Error('Google Play installs overview report is empty')
  }
  const headers = headerLine.split(',').map((h) => h.replace(/^"|"$/g, ''))
  const dateIdx = headers.indexOf('Date')
  const installsIdx = headers.indexOf('Daily User Installs')
  if (dateIdx === -1 || installsIdx === -1) {
    throw new Error(
      'Google Play installs overview report missing expected columns (Date / Daily User Installs)'
    )
  }

  const result: InstallRow[] = []
  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split(',').map((c) => c.replace(/^"|"$/g, ''))
    const date = cols[dateIdx]
    if (!date) continue
    const count = Number.parseInt(cols[installsIdx] ?? '0', 10) || 0
    result.push({date, count})
  }
  return result
}
