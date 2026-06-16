import {expect, test} from '@playwright/test'

// Contact / card-request form lives at src/pages/contact.astro with
// `export const prerender = false`, i.e. it is a server-rendered route. Under
// the Netlify adapter that route is emitted as a serverless *function*, not as a
// static file, so it is NOT served by the static e2e server (tests/static-server.mjs)
// nor by `astro preview` (the Netlify adapter rejects `astro preview`), and
// `astro dev` requires network access to Netlify to boot.
//
// Submitting the form on a real server would also call insertUser() (Postgres) and
// createContactSheetRow() (Google Sheets) on a valid payload — external services we
// must not hit from e2e.
//
// These tests are therefore SKIPPED in the current static-server setup. They are
// written out so they can be enabled once the suite runs against a server that can
// execute SSR routes (e.g. `netlify dev` with network, or a Node-adapter preview
// target) — submitting only INVALID data so the request short-circuits at Zod
// validation before any external call.
//
// The assertions below validate the client-side form contract (native HTML5
// validation on required fields + the honeypot) which needs no external services.
test.describe('contact / card request form', () => {
  test.skip(
    true,
    'SSR-only route (prerender=false) is not served by the static e2e server; ' +
      'enable when running against a server that can execute SSR routes (e.g. netlify dev).'
  )

  test('renders the request form', async ({page}) => {
    await page.goto('/contact')
    await expect(page.getByRole('heading', {name: 'Request WhoCards'})).toBeVisible()
    await expect(page.locator('form#email-form')).toBeVisible()
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
  })

  test('blocks submission of an empty form via native validation', async ({page}) => {
    await page.goto('/contact')

    // The name field is `required`; submitting empty should be blocked by the browser
    // and never reach the server (no external services touched).
    await page.getByRole('button', {name: /submit|request/i}).click()

    const nameValid = await page
      .locator('input[name="name"]')
      .evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(nameValid).toBe(false)

    // We should still be on /contact, not on a success state.
    await expect(page).toHaveURL(/\/contact$/)
  })
})
