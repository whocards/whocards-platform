import {generateKeyPairSync} from 'node:crypto'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {fetchGooglePlayInstalls, parseInstallsOverviewCsv} from './google-play'

// A real (but disposable, test-only) RSA key pair so `jsonwebtoken` can
// actually sign the OAuth2 assertion without hitting the network.
const {privateKey: TEST_PRIVATE_KEY} = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: {type: 'pkcs1', format: 'pem'},
  publicKeyEncoding: {type: 'pkcs1', format: 'pem'},
})

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

  it('sets an AbortSignal on both the OAuth2 token exchange and the Cloud Storage fetch', async () => {
    const csv = ['"Date","Daily User Installs"', '"2026-01-01","4"'].join('\n')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        async () => new Response(JSON.stringify({access_token: 'token'}), {status: 200})
      )
      .mockImplementationOnce(
        async () => new Response(new TextEncoder().encode(csv), {status: 200})
      )

    const result = await fetchGooglePlayInstalls(
      {
        serviceAccount: {client_email: 'svc@example.com', private_key: TEST_PRIVATE_KEY},
        bucket: 'pubsite_prod_rev_123',
      },
      'com.whocards.mobile'
    )

    expect(result.status).toBe('live')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    for (const call of fetchSpy.mock.calls) {
      const [, init] = call
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })
})

describe('parseInstallsOverviewCsv', () => {
  it('sums the Daily User Installs column', () => {
    const csv = [
      '"Date","Daily User Installs","Daily User Uninstalls"',
      '"2026-01-01","12","3"',
      '"2026-01-02","8","1"',
    ].join('\n')
    expect(parseInstallsOverviewCsv(csv)).toBe(20)
  })

  it('returns 0 when the expected column is missing', () => {
    expect(parseInstallsOverviewCsv('"Date","Foo"\n"2026-01-01","1"')).toBe(0)
  })

  it('returns 0 for empty input', () => {
    expect(parseInstallsOverviewCsv('')).toBe(0)
  })
})
