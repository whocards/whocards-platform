import {describe, expect, it, vi} from 'vitest'
import {fetchCountrySplit} from './posthog'

describe('fetchCountrySplit — missing credentials', () => {
  it('degrades to needs-credentials without making a network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await fetchCountrySplit(undefined)
    expect(result).toEqual({
      status: 'needs-credentials',
      source: 'posthog',
      reason: 'POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID not set',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('fetchCountrySplit — non-https host', () => {
  it('degrades to unavailable without sending the API key, when host is not https', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'http://who.whocards.cc',
    })
    expect(result.status).toBe('unavailable')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('fetchCountrySplit — malformed results', () => {
  it('degrades to unavailable when the results key is missing entirely', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), {status: 200}))
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    expect(result.status).toBe('unavailable')
    fetchSpy.mockRestore()
  })

  it('degrades to unavailable when results is not an array', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({results: 'oops'}), {status: 200}))
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    expect(result.status).toBe('unavailable')
    fetchSpy.mockRestore()
  })

  it('stays live with an empty value for a genuine, well-formed empty result set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({results: []}), {status: 200}))
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    expect(result).toEqual({status: 'live', source: 'posthog', value: []})
    fetchSpy.mockRestore()
  })
})

describe('fetchCountrySplit — live', () => {
  it('maps HogQL [name, count] result rows to NamedCount', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            ['Hungary', 120],
            ['Germany', 8],
          ],
        }),
        {status: 200}
      )
    )
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    expect(result).toEqual({
      status: 'live',
      source: 'posthog',
      value: [
        {name: 'Hungary', count: 120},
        {name: 'Germany', count: 8},
      ],
    })
    fetchSpy.mockRestore()
  })

  it('degrades to unavailable on a non-OK response, without throwing', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', {status: 500}))
    const result = await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    expect(result.status).toBe('unavailable')
    fetchSpy.mockRestore()
  })

  it('sets a request timeout signal on the fetch call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({results: []}), {status: 200}))
    await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://who.whocards.cc',
    })
    const [, init] = fetchSpy.mock.calls[0] ?? []
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    fetchSpy.mockRestore()
  })

  it('queries the PostHog app/UI host, not whatever host is passed — the caller is responsible for passing PUBLIC_POSTHOG_UI_HOST, and this asserts the URL is built from `creds.host` verbatim', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({results: []}), {status: 200}))
    await fetchCountrySplit({
      personalApiKey: 'phx_test',
      projectId: '123',
      host: 'https://eu.posthog.com',
    })
    const [url] = fetchSpy.mock.calls[0] ?? []
    expect(url instanceof Request ? url.url : String(url)).toBe(
      'https://eu.posthog.com/api/projects/123/query/'
    )
    fetchSpy.mockRestore()
  })
})
