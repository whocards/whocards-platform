#!/usr/bin/env node
// Maestro e2e gate. Run by release-it's before:init hook (both platforms) and by the
// mobile:rebuild:* scripts (one platform).
//
// CI (mobile-gate.yml) already covers lint + typecheck + unit tests on every push to
// main, so by the time you ship, those are green. What CI does NOT run is the Maestro
// e2e suite (no simulator/emulator in CI). So we run e2e locally against booted devices
// as the last gate before a build/tag goes out.
//
// Usage:
//   node scripts/release/pre-release-check.mjs          # both platforms (release)
//   node scripts/release/pre-release-check.mjs ios      # iOS only (rebuild)
//   node scripts/release/pre-release-check.mjs android  # Android only (rebuild)
//
// Needs the relevant simulator/emulator booted. Skip with RELEASE_SKIP_E2E=1 (and run
// the flows yourself, or accept the risk for a hotfix).

import {execSync} from 'node:child_process'

const only = process.argv[2]?.toLowerCase()
if (only && only !== 'ios' && only !== 'android') {
  console.error(`pre-release: unknown platform "${only}" (expected "ios" or "android")`)
  process.exit(1)
}

if (process.env.RELEASE_SKIP_E2E) {
  console.warn(
    '\n⚠️  pre-release: RELEASE_SKIP_E2E set — skipping Maestro e2e gate.\n' +
      '   Make sure the flows passed some other way before you ship.\n'
  )
  process.exit(0)
}

const allSuites = [
  ['ios', 'iOS', 'iOS simulator', 'pnpm --filter mobile e2e:ios'],
  ['android', 'Android', 'Android emulator', 'pnpm --filter mobile e2e:android'],
]
const suites = only ? allSuites.filter(([id]) => id === only) : allSuites

console.log(
  `\n▶  pre-release: running Maestro e2e gate${only ? ` (${only})` : ''} (set RELEASE_SKIP_E2E=1 to skip)\n`
)

for (const [, label, device, cmd] of suites) {
  console.log(`\n— ${label}: ${cmd}`)
  try {
    execSync(cmd, {stdio: 'inherit'})
  } catch {
    console.error(
      `\n✖  pre-release: ${label} e2e failed — aborting.\n` +
        `   Is the ${device} booted? If you must ship anyway, re-run with RELEASE_SKIP_E2E=1.\n`
    )
    process.exit(1)
  }
}

console.log('\n✓  pre-release: e2e gate passed.\n')
