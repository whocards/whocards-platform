import {defineConfig} from 'vitest/config'

// Deliberately separate from vite.config.ts: unit tests exercise pure logic and
// the tRPC router/middleware (see trpc.test.ts, question-review-logic.test.ts,
// permissions.test.ts), none of which need the TanStack Start / Nitro / Netlify
// Vite plugin chain — pulling that in here just slowed test startup/teardown
// and produced noisy (harmless) module-resolution warnings.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
