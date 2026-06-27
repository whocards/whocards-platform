import {defineConfig, devices} from '@playwright/test'

// E2E for the SSR routes — the library `/play` experience and the in-app tRPC
// API (`/api/trpc/*`). These are `prerender = false` (emitted as a Netlify
// function), so the static `dist/` harness in playwright.config.ts cannot serve
// them. We run them against `astro dev`, which serves SSR routes locally.
//
// Requires apps/website/.env (placeholder values are fine — see HANDOFF.md).
// The static-page + OG-image suites stay in playwright.config.ts.
const PORT = 4321
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e-ssr',
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
    command: `pnpm exec astro dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // /app renders in download mode under the default flags (PUBLIC_APP_IOS_LAUNCHED
    // defaults on, Android off), which is exactly what the SSR /app suite asserts.
  },
})
