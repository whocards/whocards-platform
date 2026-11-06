/** iOS installs from App Store Connect Sales Reports. Setup: docs/STATS-ENV.md. */
import {gunzipSync} from 'node:zlib'
import {APP_STORE_APP_ID} from '@whocards/app-store'

import type {MetricResult} from '../types'
import {live, needsCredentials, unavailable} from '../types'
import {signJwt} from './jwt'
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
// One deadline for the whole 30-report window, inside the 10s function budget.
const FETCH_TIMEOUT_MS = 8_000
const CONCURRENCY = 10

export const buildAppStoreConnectToken = (creds: AppStoreConnectCredentials): string => {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    'ES256',
    {kid: creds.keyId},
    {iss: creds.issuerId, aud: AUDIENCE, iat: now, exp: now + TOKEN_TTL_SECONDS},
    creds.privateKey
  )
}

const fetchDailyInstalls = async (
  creds: AppStoreConnectCredentials,
  token: string,
  filterDate: string,
  signal: AbortSignal
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
    signal,
  })
  if (response.status === 404) return 0 // No report for that day yet.
  if (!response.ok) throw new Error(`Apple returned ${response.status}`)

  const buffer = await response.arrayBuffer()
  const tsv = gunzipSync(Buffer.from(buffer)).toString('utf-8')
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
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    let total = 0
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const batch = dates.slice(i, i + CONCURRENCY)
      const counts = await Promise.all(
        batch.map((date) => fetchDailyInstalls(creds, token, date, signal))
      )
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
  const appIdx = headers.indexOf('Apple Identifier')
  if (unitsIdx === -1 || productTypeIdx === -1 || appIdx === -1) {
    throw new Error(
      'App Store sales report missing expected columns (Units / Product Type Identifier / Apple Identifier)'
    )
  }

  let total = 0
  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split('\t')
    const productType = cols[productTypeIdx]
    // 1, 1F, 1T… are first-time downloads; 7, 7F… are updates.
    if (cols[appIdx]?.trim() !== APP_STORE_APP_ID || !productType?.startsWith('1')) continue
    const units = cols[unitsIdx]?.trim() ?? ''
    // A bad cell makes the metric unavailable rather than silently undercounting.
    if (!/^\d+$/.test(units)) throw new Error(`App Store sales report has invalid Units: ${units}`)
    total += Number(units)
  }
  return total
}
