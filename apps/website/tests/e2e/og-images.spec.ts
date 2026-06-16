import {expect, test} from '@playwright/test'

// Social / Open Graph metadata (rendered by src/layouts/Head.astro):
//   - every page exposes og:image and twitter:image
//   - static pages fall back to /social.png
//   - the referenced image URL must resolve (HTTP 200 + image/* content-type)
//
// Per-question OG images now live on the SSR /play?lang=&q= page (og:image ->
// /og/{lang}/{id}.png). /play is a Netlify function and isn't served by the
// static dist/ e2e harness, so its meta is asserted on the deploy preview, not
// here — see the test.fixme at the bottom. The generated card images themselves
// ARE prerendered static, so we verify those resolve directly below.
//
// SITE_URL defaults to http://localhost:4321 for non-prod builds, so the meta
// hold absolute URLs against this origin; the e2e server runs on 4321 so they
// resolve back to it.

const sample = [
  {path: '/', expectImage: /\/social\.png$/},
  {path: '/en', expectImage: /\/social\.png$/},
  {path: '/mission', expectImage: /\/social\.png$/},
]

const metaContent = (page: import('@playwright/test').Page, property: string) =>
  page.locator(`meta[property="${property}"]`).getAttribute('content')

for (const {path, expectImage} of sample) {
  test(`${path} exposes resolvable og:image and twitter:image`, async ({page, request}) => {
    await page.goto(path)

    const ogImage = await metaContent(page, 'og:image')
    const twitterImage = await metaContent(page, 'twitter:image')

    expect(ogImage, 'og:image should be present').toBeTruthy()
    expect(twitterImage, 'twitter:image should be present').toBeTruthy()
    expect(ogImage!).toMatch(expectImage)
    // og and twitter images are the same source of truth.
    expect(twitterImage).toBe(ogImage)

    // The image URL must resolve to an actual image.
    const response = await request.get(ogImage!)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type'] || '').toMatch(/^image\//)
  })
}

// Generated card images (#44): rendered from questions.json at build time and
// prerendered to /og/{lang}/{id}.png. Verify a sample resolves, including an
// RTL language (he), since that path had the trickiest rendering.
for (const card of ['/og/en/1.png', '/og/he/1.png']) {
  test(`generated card ${card} resolves to a PNG`, async ({request}) => {
    const response = await request.get(card)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type'] || '').toMatch(/^image\/png/)
  })
}

// The new /play screen (#41) is SSR, so the static dist/ e2e harness can't serve
// it (same limitation as /contact). Asserting its per-question og:image ->
// /og/{lang}/{id}.png needs an SSR-capable server (e.g. `netlify dev`); enable
// this once the e2e harness can run functions.
test.fixme(
  'TODO: SSR /play exposes per-question og:image (needs functions-capable server)',
  async () => {
    // Verified manually on the deploy preview:
    //   /play?lang=en&q=1 -> og:image .../og/en/1.png
    //   /play?lang=he&q=2 -> og:image .../og/he/2.png
    //   /play (no q)      -> og:image .../social.png
  }
)
