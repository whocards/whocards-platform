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
})
