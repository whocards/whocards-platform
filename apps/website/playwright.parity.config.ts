import {defineConfig, devices} from '@playwright/test'

// Visual-parity suite: dual-capture (deployed vs local build) + pixel-diff.
//
// LOCAL target: build + serve dist/ on :4321 via tests/static-server.mjs.
// DEPLOYED target: DEPLOYED_URL env var (default: https://whocards.cc).
//   If DEPLOYED_URL is explicitly empty the suite test.skip()s — see parity.spec.ts.
//
// SSR routes (/play, /contact, localised /[lang]/play) are prerender:false and
// are NOT served by the static-server, so they are OUT of scope for v1.
// See tests/parity/README.md for the follow-up plan.

export default defineConfig({
  testDir: './tests/parity',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', {open: 'never'}], ['list']],
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
    command: 'pnpm build && node tests/static-server.mjs',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {PORT: '4321'},
  },
})
