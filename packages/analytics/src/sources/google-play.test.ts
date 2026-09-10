import {describe, expect, it, vi} from 'vitest'
import {fetchGooglePlayInstalls, parseInstallsOverviewCsv} from './google-play'

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

  it('degrades to needs-credentials when the service account is incomplete', async () => {
    const result = await fetchGooglePlayInstalls(
      {serviceAccount: {client_email: '', private_key: ''}, bucket: 'pubsite_prod_rev_123'},
      'com.whocards.mobile'
    )
    expect(result.status).toBe('needs-credentials')
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
