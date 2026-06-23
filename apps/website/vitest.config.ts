import {defineConfig} from 'vitest/config'

// Unit tests only (src/**). The Playwright suites under tests/ run via `test:e2e*`
// and must not be picked up by vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
