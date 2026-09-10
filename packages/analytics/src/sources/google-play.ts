/**
 * Google Play installs, for the stats page's install-count metric. Env-gated
 * and dependency-injected, same shape as ./app-store-connect — no SDK
 * dependency (no `googleapis`), just `jsonwebtoken` for the service-account
 * bearer token and `fetch` for the Cloud Storage JSON API. Google Play's
 * install-count reports are CSV files Google drops daily into a
 * Play-managed Cloud Storage bucket, not a REST "give me a number" endpoint.
 *
 * Setup (documented again in apps/website/.env.example):
 * 1. Play Console → Setup → API access → link (or create) a Google Cloud
 *    project, then create a Service Account with a JSON key.
 * 2. Play Console → Setup → API access → grant that service account "Viewer"
 *    access under Account permissions (needed to read the reports bucket).
 * 3. Play Console → Setup → API access → "Download reports" shows the Cloud
 *    Storage bucket name (`pubsite_prod_rev_<digits>`) the account can read.
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

/**
 * Total Android installs for the current calendar month, read from the
 * "installs" statistics CSV Google drops into the reports bucket at
 * `stats/installs/installs_<package>_<YYYYMM>_overview.csv` (Google's fixed
 * path convention for the overview report). Returns `needs-credentials` when
 * unset, `unavailable` (never throws) on a fetch/parse failure.
 */
export const fetchGooglePlayInstalls = async (
  creds: GooglePlayCredentials | undefined,
  packageId: string
): Promise<MetricResult<number>> => {
  if (
    !creds ||
    !creds.serviceAccount?.client_email ||
    !creds.serviceAccount?.private_key ||
    !creds.bucket
  ) {
    return needsCredentials(
      SOURCE,
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_REPORTS_BUCKET not set'
    )
  }

  try {
    const accessToken = await fetchAccessToken(creds.serviceAccount)
    const now = new Date()
    const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const objectPath = `stats/installs/installs_${packageId}_${yyyymm}_overview.csv`
    const url = `https://storage.googleapis.com/storage/v1/b/${creds.bucket}/o/${encodeURIComponent(objectPath)}?alt=media`

    const response = await fetch(url, {headers: {Authorization: `Bearer ${accessToken}`}})
    if (!response.ok) {
      return unavailable(SOURCE, `Cloud Storage returned ${response.status}`)
    }
    // Google's overview CSVs are UTF-16LE with a BOM.
    const buffer = await response.arrayBuffer()
    const csv = new TextDecoder('utf-16le').decode(buffer)
    const installs = parseInstallsOverviewCsv(csv)
    return live(installs, SOURCE)
  } catch (error) {
    return unavailable(SOURCE, error instanceof Error ? error.message : 'unknown error')
  }
}

/**
 * Parses Google's "installs overview" CSV into a total for the month. Exported
 * (pure, no fetch) so parsing is unit-testable against a fixture. Column names
 * per Google's documented format: "Daily User Installs" is the net new installs
 * for that day.
 */
export const parseInstallsOverviewCsv = (csv: string): number => {
  const lines = csv.trim().split('\n')
  const [headerLine, ...rows] = lines
  if (!headerLine) return 0
  const headers = headerLine.split(',').map((h) => h.replace(/^"|"$/g, ''))
  const idx = headers.indexOf('Daily User Installs')
  if (idx === -1) return 0

  let total = 0
  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split(',').map((c) => c.replace(/^"|"$/g, ''))
    total += Number.parseInt(cols[idx] ?? '0', 10) || 0
  }
  return total
}
