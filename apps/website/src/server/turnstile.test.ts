import {afterEach, describe, expect, it, vi} from 'vitest'
import {TURNSTILE_ACTION, turnstileErrorFor, verifyTurnstile} from './turnstile'

// Unit tests for the shared siteverify wrapper. `fetch` is stubbed so no request
// leaves the process; the assertions cover what the handler pins a token to.

const expected = {action: TURNSTILE_ACTION.contact, hostname: 'whocards.cc'} as const

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const stubSiteverify = (body: unknown, status = 200) => {
  const fetchMock = vi
    .fn<FetchFn>()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
    )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verifyTurnstile', () => {
  it('rejects a missing token without calling Cloudflare', async () => {
    const fetchMock = stubSiteverify({success: true})
    await expect(verifyTurnstile('', 'secret', expected)).resolves.toEqual({
      ok: false,
      reason: 'missing-token',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized token without calling Cloudflare', async () => {
    const fetchMock = stubSiteverify({success: true})
    const result = await verifyTurnstile('x'.repeat(2049), 'secret', expected)
    expect(result).toEqual({ok: false, reason: 'failed'})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts secret, token and remoteip to siteverify', async () => {
    const fetchMock = stubSiteverify({
      success: true,
      action: expected.action,
      hostname: expected.hostname,
    })
    await verifyTurnstile('tok', 'sec', {...expected, remoteip: '203.0.113.9'})
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(call?.[1]?.method).toBe('POST')
    const body = call?.[1]?.body
    if (!(body instanceof URLSearchParams)) throw new Error('expected URLSearchParams body')
    expect(body.get('secret')).toBe('sec')
    expect(body.get('response')).toBe('tok')
    expect(body.get('remoteip')).toBe('203.0.113.9')
  })

  it('accepts a token bound to the expected action and hostname', async () => {
    stubSiteverify({success: true, action: expected.action, hostname: expected.hostname})
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({ok: true})
  })

  it('rejects a valid token minted for another surface', async () => {
    stubSiteverify({success: true, action: TURNSTILE_ACTION.appWaitlist, hostname: 'whocards.cc'})
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('rejects a valid token minted on another hostname', async () => {
    stubSiteverify({success: true, action: expected.action, hostname: 'evil.example'})
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('rejects when Cloudflare reports success: false', async () => {
    stubSiteverify({success: false, 'error-codes': ['timeout-or-duplicate']})
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('skips action/hostname binding only for a testing-key result', async () => {
    // Cloudflare's always-pass test secret returns no action and a placeholder
    // hostname, flagged via metadata — what CI and local dev see.
    stubSiteverify({
      success: true,
      hostname: 'example.com',
      metadata: {result_with_testing_key: true},
    })
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({ok: true})
  })

  it('treats a non-2xx or malformed response as failed', async () => {
    stubSiteverify({success: true}, 502)
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
    stubSiteverify({nope: 1})
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('treats a network error as failed, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn<FetchFn>().mockRejectedValue(new Error('ECONNRESET')))
    await expect(verifyTurnstile('tok', 'sec', expected)).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })
})

describe('turnstileErrorFor', () => {
  it('keys the error on the widget field name', () => {
    expect(turnstileErrorFor('missing-token')['cf-turnstile-response']?.message).toMatch(
      /complete the security check/i
    )
    expect(turnstileErrorFor('failed')['cf-turnstile-response']?.message).toMatch(/try again/i)
  })
})
