import type {APIContext} from 'astro'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const envMock: {STATS_REFRESH_SECRET?: string} = {}
vi.mock('~env', () => ({env: envMock}))
const refreshStatsSnapshot = vi.hoisted(() =>
  vi.fn<() => Promise<{generatedAt: string}>>(async () => ({generatedAt: 'now'}))
)
vi.mock('~server/stats', () => ({refreshStatsSnapshot}))
vi.mock('@whocards/observability', () => ({logError: vi.fn<() => void>()}))

const post = async (secret: string, presented: string) => {
  envMock.STATS_REFRESH_SECRET = secret
  vi.resetModules()
  const {POST} = await import('../../pages/api/stats/refresh')
  const request = new Request('https://whocards.cc/api/stats/refresh', {
    method: 'POST',
    headers: {authorization: `Bearer ${presented}`},
  })
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- POST only reads `request`.
  return POST({request} as APIContext)
}

beforeEach(() => refreshStatsSnapshot.mockClear())

describe('POST /api/stats/refresh', () => {
  it('treats a secret shorter than 16 characters as not configured', async () => {
    const response = await post('short', 'short')
    expect(response.status).toBe(503)
    expect(refreshStatsSnapshot).not.toHaveBeenCalled()
  })

  it('refreshes with a long enough secret', async () => {
    const secret = 'a'.repeat(16)
    const response = await post(secret, secret)
    expect(response.status).toBe(200)
    expect(refreshStatsSnapshot).toHaveBeenCalledOnce()
  })
})
