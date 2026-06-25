import {expect, test} from '@playwright/test'

// /app is SSR (prerender = false). The e2e-ssr suite runs against `astro dev`
// with PUBLIC_APP_WAITLIST_ENABLED=true (set in playwright.ssr.config.ts) and
// PUBLIC_APP_LAUNCHED unset → the page renders in WAITLIST mode. Without the
// waitlist flag /app is hidden and redirects home (see app-visibility.test.ts).
// These assertions need no external services (no valid form submit, so neither
// Postgres nor Resend is touched).

test.describe('/app waitlist (pre-launch)', () => {
  test('renders the newsletter opt-in unchecked — consent is never assumed', async ({page}) => {
    await page.goto('/app')

    const newsletter = page.locator('input[name="newsletter"]').first()
    await expect(newsletter).toBeVisible()
    await expect(newsletter).not.toBeChecked()

    // Email capture is present and required.
    await expect(page.locator('input[name="email"]').first()).toBeVisible()
  })

  test('does not expose the placeholder store links while unlaunched', async ({page}) => {
    const res = await page.goto('/app')
    const html = (await res?.text()) ?? ''

    // The App Store / Play links are placeholders (idTODO / appTODO) and must be
    // unreachable until launch. In waitlist mode they are not rendered at all.
    expect(html).not.toContain('apps.apple.com')
    expect(html).not.toContain('play.google.com')
  })

  test('rejects an invalid submission before any side effect', async ({request}) => {
    const res = await request.post('/api/app-launch-subscribe', {data: {source: 'app-waitlist'}})
    expect(res.status()).toBe(400)
  })
})
