import {expect, test} from '@playwright/test'

// /app is SSR (prerender = false). The e2e-ssr suite runs against `astro dev`
// under the default flags (both stores launched) → the page offers both store
// downloads. These assertions need no external services (no valid form submit,
// so neither Postgres nor Resend is hit).

test.describe('/app download mode (iOS + Android live)', () => {
  test('offers both store downloads', async ({page}) => {
    const res = await page.goto('/app')

    // Prove we are on /app, not an unexpected redirect to /.
    expect(res?.ok()).toBeTruthy()
    expect(new URL(res!.url()).pathname).toBe('/app')

    const html = await res!.text()
    expect(html).toContain('apps.apple.com')
    expect(html).toContain('play.google.com')
    await expect(page.locator('a[data-store="ios"]').first()).toBeVisible()
    await expect(page.locator('a[data-store="android"]').first()).toBeVisible()
    await expect(page.locator('a[data-store="android-test"]')).toHaveCount(0)
  })

  test('leads Android visitors with Google Play (UA-aware ordering)', async ({browser}) => {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile',
    })
    const page = await context.newPage()
    await page.goto('/app')

    await expect(page.locator('a[data-store]').first()).toHaveAttribute('data-store', 'android')
    await context.close()
  })

  test('keeps the newsletter opt-in unchecked — consent is never assumed', async ({page}) => {
    await page.goto('/app')

    const newsletter = page.locator('input[name="newsletter"]').first()
    await expect(newsletter).toBeVisible()
    await expect(newsletter).not.toBeChecked()

    // The inbox email-capture is present and required.
    await expect(page.locator('input[name="email"]').first()).toBeVisible()
  })

  test('rejects an invalid submission before any side effect', async ({request}) => {
    const res = await request.post('/api/app-launch-subscribe', {data: {source: 'app-page'}})
    expect(res.status()).toBe(400)
  })
})
