import {defineConfig} from 'vitest/config'

// Unit tests for pure server-side logic (e.g. app-waitlist consent). SSR routes
// and pages are covered by Playwright (tests/e2e, tests/e2e-ssr); vitest only
// picks up colocated `*.test.ts` modules under src/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
