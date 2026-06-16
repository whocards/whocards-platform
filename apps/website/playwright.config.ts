import {defineConfig, devices} from '@playwright/test'

// The site is built with `output: 'static'` + the Netlify adapter. That adapter
// does not support `astro preview`, and `astro dev` requires network access to
// Netlify, so we build once and serve the static `dist/` output ourselves with a
// tiny zero-dependency Node server (see tests/static-server.mjs).
//
// Astro's `env.ts` defaults SITE_URL to http://localhost:4321 for non-prod builds,
// so absolute og:image/twitter:image URLs are baked as http://localhost:4321/...
// We therefore serve on port 4321 so those image URLs resolve against this server.
const PORT = 4321
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],
  webServer: {
    // Build the static site, then serve dist/ on PORT.
    command: 'pnpm build && node tests/static-server.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {PORT: String(PORT)},
  },
})
