import {defineConfig} from 'vitest/config'

// Unit tests for pure server-side logic (e.g. app-waitlist consent). SSR routes
// and pages are covered by Playwright (tests/e2e, tests/e2e-ssr); vitest only
// picks up colocated `*.test.ts` modules under src/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The DB-backed suites share a single PGlite instance (an in-process
    // Postgres compiled to WASM) via src/server/db/test-helpers.ts. PGlite's
    // first instantiation pays a one-time cold WASM-compile cost (~10s on CI)
    // that previously failed whichever DB file ran first with "Hook timed out in
    // 10000ms". Running the whole suite in one fork with isolation off keeps a
    // single module registry, so that module — and the WASM — is created exactly
    // once for the entire run (no per-file setup/teardown). clearMocks resets
    // vi.fn call history between tests since module state is no longer reset.
    fileParallelism: false,
    isolate: false,
    clearMocks: true,
    // Headroom for the single cold WASM compile on slower CI runners.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
