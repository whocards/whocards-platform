import {expect, test} from '@playwright/test'

// The in-app tRPC router (@whocards/api) mounted at /api/trpc/[trpc] (ADR-0002).
// Read-only queries are served over GET and carry an edge cache-control header.

const input = (value: unknown) => encodeURIComponent(JSON.stringify(value))

test('decks.manifest lists every deck without question text, cacheable', async ({request}) => {
  const res = await request.get('/api/trpc/decks.manifest')
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toContain('public')

  const {result} = await res.json()
  const slugs = result.data.map((d: {slug: string}) => d.slug)
  expect(slugs).toEqual(['library', 'hajnalig', 'ai-at-work'])

  const library = result.data[0]
  expect(library.questionCount).toBe(66)
  expect(library).not.toHaveProperty('questions')
})

test('decks.bySlug resolves a deck with its questions', async ({request}) => {
  const res = await request.get(`/api/trpc/decks.bySlug?input=${input({slug: 'library'})}`)
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toContain('public')

  const {result} = await res.json()
  expect(result.data.questionIds).toHaveLength(66)
  expect(result.data.questions['1'].en).toMatch(/interesting/i)
})

test('decks.bySlug returns 404 for an unknown slug', async ({request}) => {
  const res = await request.get(`/api/trpc/decks.bySlug?input=${input({slug: 'nope'})}`)
  expect(res.status()).toBe(404)

  const body = await res.json()
  expect(body.error.data.code).toBe('NOT_FOUND')
})

test('pool.languages returns the Pool language metadata', async ({request}) => {
  const res = await request.get('/api/trpc/pool.languages')
  expect(res.status()).toBe(200)

  const {result} = await res.json()
  expect(result.data.default).toBe('en')
  expect(result.data.codes).toHaveLength(14)
  expect(result.data.names.en).toBe('English')
})
