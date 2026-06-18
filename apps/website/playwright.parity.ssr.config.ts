import {defineConfig, devices} from '@playwright/test'

// Visual-parity suite v2: dual-capture (deployed vs local astro dev) + pixel-diff.
//
// LOCAL target: `astro dev` on :4321 (SSR routes like /play, /contact are
//   prerender=false and are NOT served by the static-server harness in v1).
// DEPLOYED target: DEPLOYED_URL env var (default: https://whocards.cc).
//   If DEPLOYED_URL is explicitly empty the suite test.skip()s.
//
// Dev toolbar: disabled at source via astro.config `devToolbar.enabled` (gated on
//   DISABLE_DEV_TOOLBAR, set below). _capture.ts also hides <astro-dev-toolbar> via
//   CSS as a fallback for `reuseExistingServer` (a dev's own `astro dev` won't have
//   the flag set).
//
// Play determinism: /play?lang=en&q=1 uses a ?q= deep link so the Play island
//   starts at question 1 (not a random shuffle) — identical on both origins.

export default defineConfig({
  testDir: './tests/parity-ssr',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Separate report folder so v2 doesn't overwrite v1's playwright-report/.
  reporter: [['html', {open: 'never', outputFolder: 'playwright-report-ssr'}], ['list']],
  use: {
    trace: 'on-first-retry',
  },
  timeout: 60_000,
  projects: [
    {
      name: 'desktop',
      use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 800}},
    },
    {
      name: 'mobile',
      use: {...devices['Desktop Chrome'], viewport: {width: 390, height: 844}},
    },
  ],
  webServer: {
    command: 'pnpm exec astro dev --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {DISABLE_DEV_TOOLBAR: 'true'},
  },
})
