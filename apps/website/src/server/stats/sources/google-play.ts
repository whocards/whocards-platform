/** Android installs from the monthly CSVs in the Play Console reports bucket. Setup: docs/STATS-ENV.md. */
import jwt from 'jsonwebtoken'

import type {MetricResult} from '../types'
import {live, needsCredentials, unavailable} from '../types'
import {reportWindowDates} from './report-window'

export type GooglePlayServiceAccount = {
  client_email: string
  private_key: string
}

export type GooglePlayCredentials = {
  serviceAccount: GooglePlayServiceAccount
  bucket: string
}

const SOURCE = 'google-play'
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only'
const TOKEN_TTL_SECONDS = 60 * 60
const FETCH_TIMEOUT_MS = 10_000

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

const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const previousMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))

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
  if (response.status === 404) return [] // No report for that month yet.
  if (!response.ok) throw new Error(`Cloud Storage returned ${response.status}`)
  // Google's overview CSVs are UTF-16LE with a BOM.
  const buffer = await response.arrayBuffer()
  const csv = new TextDecoder('utf-16le').decode(buffer)
  return parseInstallsOverviewRows(csv)
}

/** The 30-day window can span two monthly CSVs, so this reads both and filters to the window. */
export const fetchGooglePlayInstalls = async (
  creds: GooglePlayCredentials | undefined,
  packageId: string,
  now: Date = new Date()
): Promise<MetricResult<number>> => {
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
