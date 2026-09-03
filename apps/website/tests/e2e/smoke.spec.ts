import {expect, test} from '@playwright/test'

// Smoke: the landing page renders and the key statically-built routes return 200.
// SSR-only routes (/contact, /api/*) are intentionally excluded here — they are
// emitted as a Netlify function, not static files (see tests/static-server.mjs).

test('landing page renders', async ({page}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)

  // Hero copy is stable, server-rendered content.
  await expect(page.getByRole('heading', {level: 1})).toContainText('Conversation')

  // Primary calls to action.
  await expect(page.getByRole('link', {name: 'Request Cards'}).first()).toBeVisible()

  // Document title comes from the shared Head.astro layout.
  await expect(page).toHaveTitle(/WhoCards/)

  await expect(page.getByRole('link', {name: 'AI team check-in questions'})).toHaveAttribute(
    'href',
    '/ai-at-work'
  )
})

test('AI Check-In has intent-aligned metadata and links back to the conversation game', async ({
  page,
}) => {
  await page.goto('/ai-at-work')

  await expect(page).toHaveTitle(
    'WhoCards | AI Team Check-In Questions for Honest Conversations'
  )
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Talk to your team about AI with a free set of AI team check-in questions/
  )
  await expect(page.getByRole('heading', {level: 1})).toHaveCount(1)
  await expect(page.getByRole('link', {name: 'free WhoCards conversation game'})).toHaveAttribute(
    'href',
    '/'
  )
})

const staticRoutes = [
  '/',
  '/en',
  '/mission',
  '/ai-at-work',
  '/print',
  '/images',
  '/events/hajnalig',
  '/events/hajnalig/play',
]

// /en/question/:id now 301-redirects to /play?lang=en&q=:id (netlify.toml), and
// /play is an SSR function — neither is served by the static dist/ e2e harness,
// so they're covered by Netlify's redirect-rules check + the deploy preview, not here.

for (const route of staticRoutes) {
  test(`route ${route} returns 200`, async ({request}) => {
    const response = await request.get(route)
    expect(response.status()).toBe(200)
  })
}

test('unknown route serves the 404 page', async ({request}) => {
  const response = await request.get('/this-route-does-not-exist')
  expect(response.status()).toBe(404)
})
