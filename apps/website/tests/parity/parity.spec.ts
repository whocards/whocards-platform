import {test} from '@playwright/test'
import type {TestInfo} from '@playwright/test'
import {captureAndDiff} from './_capture'
import {DEPLOYED_URL, routes} from './routes'

// ---------------------------------------------------------------------------
// v1 static-route visual-parity loop
// ---------------------------------------------------------------------------
// All capture/diff/stabilisation logic lives in tests/parity/_capture.ts.
// This file is a thin manifest loop — add/remove routes in routes.ts.

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

    await captureAndDiff({page, context, testInfo, deployedUrl, localUrl, label})
  })
}
