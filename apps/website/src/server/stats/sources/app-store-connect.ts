/** iOS installs from App Store Connect Sales Reports. Setup: docs/STATS-ENV.md. */
import jwt from 'jsonwebtoken'

import type {MetricResult} from '../types'
import {live, needsCredentials, unavailable} from '../types'
import {reportWindowDates} from './report-window'

export type AppStoreConnectCredentials = {
  keyId: string
  issuerId: string
  /** The .p8 file contents (PEM). */
  privateKey: string
  vendorNumber: string
}

const SOURCE = 'app-store-connect'
const AUDIENCE = 'appstoreconnect-v1'
const TOKEN_TTL_SECONDS = 20 * 60 // Apple caps this token at 20 minutes.
const FETCH_TIMEOUT_MS = 10_000
// 30 daily reports at 10 wide is 3 rounds, comfortably inside the 10s function budget.
const CONCURRENCY = 10

export const buildAppStoreConnectToken = (creds: AppStoreConnectCredentials): string =>
  jwt.sign({}, creds.privateKey, {
    algorithm: 'ES256',
    keyid: creds.keyId,
    issuer: creds.issuerId,
    audience: AUDIENCE,
    expiresIn: TOKEN_TTL_SECONDS,
  })

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
  if (response.status === 404) return 0 // No report for that day yet.
  if (!response.ok) throw new Error(`Apple returned ${response.status}`)

  const buffer = await response.arrayBuffer()
  const zlib = await import('node:zlib')
  const tsv = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8')
  return parseSalesReportInstalls(tsv)
}

/** Apple only publishes daily reports, so this sums one per day in the window. */
export const fetchAppStoreInstalls = async (
  creds: AppStoreConnectCredentials | undefined
): Promise<MetricResult<number>> => {
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

export const parseSalesReportInstalls = (tsv: string): number => {
  const lines = tsv.trim().split('\n')
  const [headerLine, ...rows] = lines
  if (!headerLine) {
    throw new Error('App Store sales report is empty')
  }
  const headers = headerLine.split('\t')
  const unitsIdx = headers.indexOf('Units')
  const productTypeIdx = headers.indexOf('Product Type Identifier')
  if (unitsIdx === -1 || productTypeIdx === -1) {
    throw new Error(
      'App Store sales report missing expected columns (Units / Product Type Identifier)'
    )
  }

  let total = 0
  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split('\t')
    const productType = cols[productTypeIdx]
    // 1, 1F, 1T… are first-time downloads; 7, 7F… are updates.
    if (productType?.startsWith('1')) {
      total += Number.parseInt(cols[unitsIdx] ?? '0', 10) || 0
    }
  }
  return total
}
