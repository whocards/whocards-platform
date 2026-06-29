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
// The relevant simulator/emulator is booted automatically before its suite runs (set
// RELEASE_SKIP_BOOT=1 to boot them yourself). Skip the whole gate with RELEASE_SKIP_E2E=1
// (and run the flows yourself, or accept the risk for a hotfix).

import {execSync, spawn} from 'node:child_process'

const only = process.argv[2]?.toLowerCase()
if (only && only !== 'ios' && only !== 'android') {
  console.error(`pre-release: unknown platform "${only}" (expected "ios" or "android")`)
  process.exit(1)
}

// Coarse synchronous sleep so we can poll for boot completion without async.
const sleep = (seconds) => execSync(`sleep ${seconds}`)

// Boot an iOS simulator if none is running. Picks the first available iPhone and waits
// for it to finish booting, then opens the Simulator UI.
function ensureIosBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return
  let booted
  try {
    booted = execSync('xcrun simctl list devices booted', {encoding: 'utf8'})
  } catch {
    console.warn('   pre-release: xcrun simctl unavailable — skipping iOS auto-boot.')
    return
  }
  if (/\bBooted\b/.test(booted)) {
    console.log('   iOS simulator already booted.')
    return
  }

  let udid
  try {
    const {devices} = JSON.parse(
      execSync('xcrun simctl list devices available --json', {encoding: 'utf8'})
    )
    for (const [runtime, list] of Object.entries(devices)) {
      if (!/iOS/.test(runtime)) continue
      const iphone = list.find((d) => d.isAvailable && /iPhone/.test(d.name))
      if (iphone) {
        udid = iphone.udid
        break
      }
    }
  } catch {
    // fall through — open -a Simulator can still boot the last-used device
  }

  console.log(`   Booting iOS simulator${udid ? ` (${udid})` : ''}…`)
  try {
    // `-b` boots the device if needed, then blocks until it's fully booted.
    execSync(`xcrun simctl bootstatus ${udid ?? 'booted'} -b`, {stdio: 'inherit'})
  } catch {
    console.warn('   pre-release: could not confirm iOS boot — continuing anyway.')
  }
  try {
    execSync('open -a Simulator', {stdio: 'ignore'})
  } catch {
    // headless boot still works for Maestro even if the UI doesn't open
  }
}

// Boot an Android emulator if none is running. Picks the first AVD, launches it
// detached, and waits for sys.boot_completed.
function ensureAndroidBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return
  let devices
  try {
    devices = execSync('adb devices', {encoding: 'utf8'})
  } catch {
    console.warn('   pre-release: adb unavailable — skipping Android auto-boot.')
    return
  }
  if (/emulator-\d+\s+device/.test(devices)) {
    console.log('   Android emulator already booted.')
    return
  }

  let avd
  try {
    avd = execSync('emulator -list-avds', {encoding: 'utf8'})
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0]
  } catch {
    console.warn('   pre-release: emulator binary unavailable — skipping Android auto-boot.')
    return
  }
  if (!avd) {
    console.warn('   pre-release: no Android AVD found — skipping Android auto-boot.')
    return
  }

  console.log(`   Booting Android emulator (${avd})…`)
  const child = spawn('emulator', ['-avd', avd, '-no-snapshot-save'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  try {
    execSync('adb wait-for-device', {stdio: 'inherit', timeout: 120_000})
  } catch {
    console.warn('   pre-release: adb wait-for-device failed — continuing anyway.')
    return
  }

  const timeoutMs = 180_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    let prop = ''
    try {
      prop = execSync('adb shell getprop sys.boot_completed', {encoding: 'utf8'}).trim()
    } catch {
      // device not ready yet
    }
    if (prop === '1') {
      console.log('   Android emulator booted.')
      return
    }
    sleep(2)
  }
  console.warn('   pre-release: Android boot not confirmed within 3m — continuing anyway.')
}

const boot = {ios: ensureIosBooted, android: ensureAndroidBooted}

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

for (const [id, label, device, cmd] of suites) {
  console.log(`\n— ${label}: ${cmd}`)
  boot[id]()
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
