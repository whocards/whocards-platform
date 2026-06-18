import {test} from '@playwright/test'
import type {TestInfo} from '@playwright/test'
import {captureAndDiff} from '../parity/_capture'
import {DEPLOYED_URL, routes} from './routes'

// ---------------------------------------------------------------------------
// v2 SSR visual-parity loop — astro dev local harness
// ---------------------------------------------------------------------------
// Covers SSR routes (prerender: false) that the static-server cannot serve.
// All capture/diff/stabilisation logic lives in tests/parity/_capture.ts.
//
// Local server: `astro dev --port 4321` (started by playwright.parity.ssr.config.ts).
//   The Astro dev toolbar is hidden via CSS in _capture.ts stabilisation.
//
// Play determinism: ?lang=&q= deep links force the Play island to the same
//   question on both origins. The Play island is client:only='react', so the
//   waitForSelector option in the route manifest waits until the card is painted
//   before screenshotting.
//
// NOTE: dev-mode (astro dev) vs prod-deploy rendering will introduce minor noise
//   (e.g. Vite HMR scripts, slightly different asset paths). This is expected —
//   the suite is a triage tool, not a strict pass/fail gate.

for (const route of routes) {
  const label = route.name ?? route.path

  test(label, async ({page, context}, testInfo: TestInfo) => {
    // Skip cleanly when DEPLOYED_URL is explicitly unset (CI without network access).
    if (!DEPLOYED_URL) {
      test.skip(true, 'DEPLOYED_URL is unset — skipping parity check')
      return
    }

    const deployedUrl = `${DEPLOYED_URL}${route.path}`
    const localUrl = `http://localhost:4321${route.path}`

    await captureAndDiff({
      page,
      context,
      testInfo,
      deployedUrl,
      localUrl,
      label,
      waitForSelector: route.waitForSelector,
    })
  })
}
