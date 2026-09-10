import {describe, expect, it, vi} from 'vitest'
import {fetchAppStoreInstalls, parseSalesReportInstalls} from './app-store-connect'

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

  it('degrades to needs-credentials when only some fields are set', async () => {
    const result = await fetchAppStoreInstalls({
      keyId: 'abc',
      issuerId: '',
      privateKey: '',
      vendorNumber: '',
    })
    expect(result.status).toBe('needs-credentials')
  })
})

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

  it('returns 0 for an empty or headerless report', () => {
    expect(parseSalesReportInstalls('')).toBe(0)
  })

  it('returns 0 when expected columns are missing', () => {
    expect(parseSalesReportInstalls('Foo\tBar\n1\t2')).toBe(0)
  })
})
