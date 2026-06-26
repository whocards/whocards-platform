import {expect, test} from '@playwright/test'

// /app is SSR (prerender = false). The e2e-ssr suite runs against `astro dev`
// under the default flags (PUBLIC_APP_IOS_LAUNCHED on, PUBLIC_APP_ANDROID_LAUNCHED
// off) → the page renders in download mode: iOS is a real App Store download and
// Android routes to the /android-testers Closed Test funnel. These assertions need
// no external services (no valid form submit, so neither Postgres nor Resend is hit).

test.describe('/app download mode (iOS live, Android in testing)', () => {
  test('offers the real iOS App Store download', async ({page}) => {
    const res = await page.goto('/app')

    // Prove we are on /app, not an unexpected redirect to /.
    expect(res?.ok()).toBeTruthy()
    expect(new URL(res!.url()).pathname).toBe('/app')

    const html = await res!.text()
    expect(html).toContain('apps.apple.com')
    await expect(page.locator('a[data-store="ios"]').first()).toBeVisible()
  })

  test('routes Android visitors to the tester funnel, not a dead Play badge', async ({page}) => {
    const res = await page.goto('/app')
    const html = await res!.text()

    // While Android is in Closed Testing the Play store link must not appear.
    expect(html).not.toContain('play.google.com')

    const androidTile = page.locator('a[data-store="android-test"]').first()
    await expect(androidTile).toBeVisible()
    await expect(androidTile).toHaveAttribute('href', '/android-testers')
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
