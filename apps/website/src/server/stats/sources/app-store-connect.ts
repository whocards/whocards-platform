/**
 * App Store Connect installs (Analytics Reports API), for the stats page's
 * install-count metric. Env-gated and dependency-injected — this module never
 * reads `process.env` itself, so it stays host-agnostic and unit-testable
 * (the host, apps/website, reads its typed env and passes credentials in).
 *
 * Setup (documented again in apps/website/.env.example):
 * 1. App Store Connect → Users and Access → Integrations → App Store Connect API
 *    → create a key with the "Sales and Reports" (or "Admin") role. Note the
 *    Key ID and Issuer ID, and download the .p8 private key (shown once).
 * 2. `APP_STORE_CONNECT_KEY_ID` = the Key ID.
 *    `APP_STORE_CONNECT_ISSUER_ID` = the Issuer ID (same for all keys on the team).
 *    `APP_STORE_CONNECT_PRIVATE_KEY` = the full .p8 file contents (PEM, incl.
 *    the BEGIN/END lines — Netlify env vars support multi-line values).
 *    `APP_STORE_CONNECT_VENDOR_NUMBER` = Users and Access → (your name) →
 *    the numeric Vendor Number shown at the top, needed for Sales Reports.
 *
 * Docs: https://developer.apple.com/documentation/appstoreconnectapi
 */
import jwt from 'jsonwebtoken'

import type {MetricResult} from '../types'
import {live, needsCredentials, unavailable} from '../types'

export type AppStoreConnectCredentials = {
  keyId: string
  issuerId: string
  /** PEM-encoded ES256 private key (.p8 file contents). */
  privateKey: string
  vendorNumber: string
}

const SOURCE = 'app-store-connect'
const AUDIENCE = 'appstoreconnect-v1'
const TOKEN_TTL_SECONDS = 20 * 60 // Apple caps this token at 20 minutes.
const FETCH_TIMEOUT_MS = 10_000
/** Apple only publishes one SALES/SUMMARY report per day — sum the trailing month for a stable count. */
const REPORT_WINDOW_DAYS = 30
/** Cap concurrent report fetches so a 30-day backfill doesn't open 30 sockets at once. */
const CONCURRENCY = 5

/** Builds the short-lived ES256 JWT App Store Connect requires on every request. */
export const buildAppStoreConnectToken = (creds: AppStoreConnectCredentials): string =>
  jwt.sign({}, creds.privateKey, {
    algorithm: 'ES256',
    keyid: creds.keyId,
    issuer: creds.issuerId,
    audience: AUDIENCE,
    expiresIn: TOKEN_TTL_SECONDS,
  })

/** The last `REPORT_WINDOW_DAYS` calendar dates (UTC, `YYYY-MM-DD`), starting yesterday — today's report isn't final yet. */
const reportWindowDates = (): string[] => {
  const dates: string[] = []
  for (let daysAgo = 1; daysAgo <= REPORT_WINDOW_DAYS; daysAgo++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - daysAgo)
    const [iso] = d.toISOString().split('T')
    if (iso) dates.push(iso)
  }
  return dates
}

/**
 * Fetches and sums one day's SALES/SUMMARY report. A 404 means Apple hasn't
 * generated a report for that day yet (e.g. a very new app, or today's report
 * still processing) — treated as 0 installs for that day, not an error. Any
 * other non-OK status throws, which the caller turns into `unavailable`.
 */
const fetchDailyInstalls = async (
  creds: AppStoreConnectCredentials,
  token: string,
  filterDate: string
): Promise<number> => {
  const params = new URLSearchParams({
    'filter[frequency]': 'DAILY',
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': creds.vendorNumber,
    'filter[reportDate]': filterDate,
  })
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/a-gzip'},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (response.status === 404) return 0
  if (!response.ok) throw new Error(`Apple returned ${response.status}`)

  // Response body is gzip-compressed TSV — one row per unit type; installs are
  // rows where "Product Type Identifier" starts with "1" (a first-time download).
  const buffer = await response.arrayBuffer()
  const zlib = await import('node:zlib')
  const tsv = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8')
  return parseSalesReportInstalls(tsv)
}

/**
 * Total iOS installs (first-time app downloads), summed over the trailing
 * `REPORT_WINDOW_DAYS` days via the Sales and Trends Reports endpoint (one
 * report per day — there is no native "last 30 days" aggregate). Returns
 * `needs-credentials` when any credential is missing, and `unavailable`
 * (never throws) on a network/auth/parse failure — the page shows "not
 * connected yet" rather than crash the SSR render.
 */
export const fetchAppStoreInstalls = async (
  creds: AppStoreConnectCredentials | undefined
): Promise<MetricResult<number>> => {
  // Field-by-field completeness is the caller's job (apps/website's
  // `appStoreConnectCredentials()` builds this object only when every env var
  // is set) — checking again here would duplicate that check, so this module
  // only distinguishes "no credentials at all" from "have them."
  if (!creds) {
    return needsCredentials(SOURCE, 'APP_STORE_CONNECT_* env vars not set')
  }

  try {
    const token = buildAppStoreConnectToken(creds)
    const dates = reportWindowDates()
    let total = 0
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const batch = dates.slice(i, i + CONCURRENCY)
      const counts = await Promise.all(batch.map((date) => fetchDailyInstalls(creds, token, date)))
      total += counts.reduce((sum, count) => sum + count, 0)
    }
    return live(total, SOURCE)
  } catch (error) {
    return unavailable(SOURCE, error instanceof Error ? error.message : 'unknown error')
  }
}

/**
 * Parses the Sales Report TSV into a total install count. Exported (pure, no
 * fetch) so the parsing logic itself is unit-testable against a fixture
 * without hitting Apple's servers.
 */
export const parseSalesReportInstalls = (tsv: string): number => {
  const lines = tsv.trim().split('\n')
  const [headerLine, ...rows] = lines
  if (!headerLine) return 0
  const headers = headerLine.split('\t')
  const unitsIdx = headers.indexOf('Units')
  const productTypeIdx = headers.indexOf('Product Type Identifier')
  if (unitsIdx === -1 || productTypeIdx === -1) return 0

  let total = 0
  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split('\t')
    const productType = cols[productTypeIdx]
    // "1", "1F", "1T" etc. = first-time download unit types (Apple's Sales
    // Report unit-type codes); "7"/"7F" are updates and must not be counted.
    if (productType?.startsWith('1')) {
      total += Number.parseInt(cols[unitsIdx] ?? '0', 10) || 0
    }
  }
  return total
}
