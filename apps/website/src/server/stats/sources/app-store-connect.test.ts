import {generateKeyPairSync} from 'node:crypto'
import zlib from 'node:zlib'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {fetchAppStoreInstalls, parseSalesReportInstalls} from './app-store-connect'

// A real (but disposable, test-only) ES256 key pair so `jsonwebtoken` can
// actually sign the request token without hitting the network.
const {privateKey: TEST_PRIVATE_KEY} = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: {type: 'sec1', format: 'pem'},
  publicKeyEncoding: {type: 'spki', format: 'pem'},
})

const CREDS = {keyId: 'kid', issuerId: 'iss', privateKey: TEST_PRIVATE_KEY, vendorNumber: '123'}

describe('fetchAppStoreInstalls — missing credentials', () => {
  it('degrades to needs-credentials without making a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await fetchAppStoreInstalls(undefined)
    expect(result).toEqual({
      status: 'needs-credentials',
      source: 'app-store-connect',
      reason: 'APP_STORE_CONNECT_* env vars not set',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

const gzipTsv = (tsv: string) => zlib.gzipSync(Buffer.from(tsv, 'utf-8'))

const tsvWithInstalls = (units: number) =>
  ['Provider\tProduct Type Identifier\tUnits\tTitle', `Apple\t1\t${units}\tWhoCards`].join('\n')

describe('fetchAppStoreInstalls — 30-day aggregation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sums installs across the trailing 30 daily reports, not just one day', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(gzipTsv(tsvWithInstalls(1)), {status: 200}))
    const result = await fetchAppStoreInstalls(CREDS)
    expect(fetchSpy).toHaveBeenCalledTimes(30)
    expect(result).toMatchObject({status: 'live', value: 30})
  })

  it('treats a 404 (no report generated yet for that day) as 0, not a failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      // Only the most recent day (first in the window) "has" a report.
      const hasReport = url.includes(reportWindowFirstDate())
      return hasReport
        ? new Response(gzipTsv(tsvWithInstalls(7)), {status: 200})
        : new Response(null, {status: 404})
    })
    const result = await fetchAppStoreInstalls(CREDS)
    expect(result).toMatchObject({status: 'live', value: 7})
  })

  it('degrades to unavailable when a non-404 error status is returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, {status: 500}))
    const result = await fetchAppStoreInstalls(CREDS)
    expect(result.status).toBe('unavailable')
  })

  it('sets a request timeout signal on the fetch call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(gzipTsv(tsvWithInstalls(0)), {status: 200}))
    await fetchAppStoreInstalls(CREDS)
    const [, init] = fetchSpy.mock.calls[0] ?? []
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})

/** Mirrors `reportWindowDates()[0]` (yesterday, UTC) without importing the internal helper. */
function reportWindowFirstDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  const [iso] = d.toISOString().split('T')
  return iso ?? ''
}

describe('parseSalesReportInstalls', () => {
  it('sums Units for first-time-download product types, excluding updates', () => {
    const tsv = [
      'Provider\tProduct Type Identifier\tUnits\tTitle',
      'Apple\t1\t10\tWhoCards',
      'Apple\t1F\t5\tWhoCards',
      'Apple\t7\t100\tWhoCards', // update, must not count
      'Apple\t7T\t50\tWhoCards', // update, must not count
    ].join('\n')
    expect(parseSalesReportInstalls(tsv)).toBe(15)
  })

  it('throws for an empty or headerless report, rather than returning a false 0', () => {
    expect(() => parseSalesReportInstalls('')).toThrow(/empty/)
  })

  it('throws when expected columns are missing, rather than returning a false 0', () => {
    expect(() => parseSalesReportInstalls('Foo\tBar\n1\t2')).toThrow(/missing expected columns/)
  })
})

describe('fetchAppStoreInstalls — a malformed report degrades to unavailable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not surface a false live 0 when a report is missing expected columns', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(gzipTsv('Foo\tBar\n1\t2'), {status: 200})
    )
    const result = await fetchAppStoreInstalls(CREDS)
    expect(result.status).toBe('unavailable')
  })
})
