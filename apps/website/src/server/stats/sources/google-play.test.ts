import {generateKeyPairSync} from 'node:crypto'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {fetchGooglePlayInstalls, parseInstallsOverviewRows} from './google-play'

const {privateKey: TEST_PRIVATE_KEY} = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {type: 'pkcs1', format: 'pem'},
  publicKeyEncoding: {type: 'pkcs1', format: 'pem'},
})

const CREDS = {
  serviceAccount: {client_email: 'svc@example.com', private_key: TEST_PRIVATE_KEY},
  bucket: 'pubsite_prod_rev_123',
}

const utf16le = (csv: string) => Buffer.from(csv, 'utf16le')

const mockTokenExchange = () => new Response(JSON.stringify({access_token: 'token'}), {status: 200})

const callUrl = (input: unknown): string => (input instanceof Request ? input.url : String(input))

describe('fetchGooglePlayInstalls — missing credentials', () => {
  it('degrades to needs-credentials without making a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await fetchGooglePlayInstalls(undefined, 'com.whocards.mobile')
    expect(result).toEqual({
      status: 'needs-credentials',
      source: 'google-play',
      reason: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_REPORTS_BUCKET not set',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('fetchGooglePlayInstalls — request timeouts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets an AbortSignal on the OAuth2 token exchange and both Cloud Storage fetches', async () => {
    const csv = ['"Date","Daily User Installs"', '"2026-01-01","4"'].join('\n')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => mockTokenExchange())
      .mockImplementationOnce(async () => new Response(utf16le(csv), {status: 200}))
      .mockImplementationOnce(async () => new Response(utf16le(csv), {status: 200}))

    const result = await fetchGooglePlayInstalls(
      CREDS,
      'com.whocards.mobile',
      new Date('2026-01-15T00:00:00Z')
    )

    expect(result.status).toBe('live')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    for (const call of fetchSpy.mock.calls) {
      const [, init] = call
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })
})

describe('fetchGooglePlayInstalls — 30-day window across a month boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sums rows from the current and previous month, filtered to the trailing 30-day window', async () => {
    // now = 2026-02-03 → window is 2026-01-04 .. 2026-02-02 (30 days, UTC).
    const now = new Date('2026-02-03T00:00:00Z')
    const januaryCsv = [
      '"Date","Daily User Installs"',
      '"2026-01-03","100"', // just before the window — must be excluded
      '"2026-01-04","5"', // window start — must be included
    ].join('\n')
    const februaryCsv = [
      '"Date","Daily User Installs"',
      '"2026-02-01","3"',
      '"2026-02-02","2"', // window end — must be included
      '"2026-02-03","999"', // today, not yet in a published report window — must be excluded
    ].join('\n')

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => mockTokenExchange())
      .mockImplementationOnce(async () => new Response(utf16le(februaryCsv), {status: 200}))
      .mockImplementationOnce(async () => new Response(utf16le(januaryCsv), {status: 200}))

    const result = await fetchGooglePlayInstalls(CREDS, 'com.whocards.mobile', now)

    expect(result).toMatchObject({status: 'live', value: 5 + 3 + 2})
    const [, februaryCall, januaryCall] = fetchSpy.mock.calls
    expect(callUrl(februaryCall?.[0])).toContain('202602')
    expect(callUrl(januaryCall?.[0])).toContain('202601')
  })

  it("treats a 404 for the previous month's report as no rows, not a failure (e.g. a brand-new app)", async () => {
    const now = new Date('2026-02-03T00:00:00Z')
    const februaryCsv = ['"Date","Daily User Installs"', '"2026-02-01","3"'].join('\n')
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => mockTokenExchange())
      .mockImplementationOnce(async () => new Response(utf16le(februaryCsv), {status: 200}))
      .mockImplementationOnce(async () => new Response(null, {status: 404}))

    const result = await fetchGooglePlayInstalls(CREDS, 'com.whocards.mobile', now)
    expect(result).toMatchObject({status: 'live', value: 3})
  })

  it('degrades to unavailable when a report throws (e.g. missing expected columns)', async () => {
    const now = new Date('2026-02-03T00:00:00Z')
    const malformedCsv = ['"Date","Foo"', '"2026-02-01","3"'].join('\n')
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => mockTokenExchange())
      .mockImplementationOnce(async () => new Response(utf16le(malformedCsv), {status: 200}))
      .mockImplementationOnce(async () => new Response(utf16le(''), {status: 200}))

    const result = await fetchGooglePlayInstalls(CREDS, 'com.whocards.mobile', now)
    expect(result.status).toBe('unavailable')
  })
})

describe('parseInstallsOverviewRows', () => {
  it('parses one row per day, keyed by date', () => {
    const csv = [
      '"Date","Daily User Installs","Daily User Uninstalls"',
      '"2026-01-01","12","3"',
      '"2026-01-02","8","1"',
    ].join('\n')
    expect(parseInstallsOverviewRows(csv)).toEqual([
      {date: '2026-01-01', count: 12},
      {date: '2026-01-02', count: 8},
    ])
  })

  it('throws when the Daily User Installs column is missing, rather than returning an empty/zero result', () => {
    expect(() => parseInstallsOverviewRows('"Date","Foo"\n"2026-01-01","1"')).toThrow(
      /missing expected columns/
    )
  })

  it('throws when the Date column is missing', () => {
    expect(() => parseInstallsOverviewRows('"Daily User Installs"\n"1"')).toThrow(
      /missing expected columns/
    )
  })

  it('throws for empty input rather than returning 0', () => {
    expect(() => parseInstallsOverviewRows('')).toThrow(/empty/)
  })
})
