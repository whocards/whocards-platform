#!/usr/bin/env node
// Maestro e2e gate. Run by release-it's before:init hook (both platforms), by the
// mobile:rebuild:* scripts (one platform), and standalone via `pnpm release:check`.
//
// CI (mobile-gate.yml) already covers lint + typecheck + unit tests on every push to
// main, so by the time you ship, those are green. What CI does NOT run is the Maestro
// e2e suite (no simulator/emulator in CI). So we run e2e locally against booted devices
// as the last gate before a build/tag goes out.
//
// Usage:
//   pnpm release:check                                  # both platforms, e2e only (no version bump)
//   pnpm release:check android                          # one platform, e2e only (no version bump)
//   node scripts/release/pre-release-check.mjs          # both platforms (release before:init hook)
//   node scripts/release/pre-release-check.mjs ios      # iOS only (rebuild)
//   node scripts/release/pre-release-check.mjs android  # Android only (rebuild)
//
// `pnpm release:check` runs this gate on its own — the device boot/warm-up/teardown and
// the full e2e suite, but none of release-it's version bump / commit / tag. Use it to
// dry-run the gate without cutting a release.
//
// The relevant simulator/emulator is booted automatically before its suite runs (set
// RELEASE_SKIP_BOOT=1 to boot them yourself). Skip the whole gate with RELEASE_SKIP_E2E=1
// (and run the flows yourself, or accept the risk for a hotfix).
//
// A platform that passes is recorded against the current git revision in a temp file, so
// a re-run on the same code skips suites that already passed (e.g. iOS passed but Android
// failed → fix Android, re-run, only Android runs). The record is invalidated as soon as
// the tree changes. Force a full re-run with RELEASE_FORCE_E2E=1 (or delete the file).

import {execSync, spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const only = process.argv[2]?.toLowerCase()
if (only && only !== 'ios' && only !== 'android') {
  console.error(`pre-release: unknown platform "${only}" (expected "ios" or "android")`)
  process.exit(1)
}

// Coarse synchronous sleep so we can poll for boot completion without async.
const sleep = (seconds) => execSync(`sleep ${seconds}`)

// The Android SDK tools usually aren't on PATH (only ANDROID_HOME is set), so resolve the
// emulator/adb binaries from the SDK and fall back to a bare name (PATH) if not found.
function resolveAndroidTool(name, subdir) {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'Library', 'Android', 'sdk')
  const candidate = path.join(sdk, subdir, name)
  return existsSync(candidate) ? candidate : name
}
const EMULATOR = resolveAndroidTool('emulator', 'emulator')
const ADB = resolveAndroidTool('adb', 'platform-tools')

// ── per-revision pass cache ────────────────────────────────────────────────────────────
// Keyed to HEAD + working-tree state, so it only short-circuits when nothing changed.
const CACHE_FILE = path.join(os.tmpdir(), 'whocards-prerelease-e2e.json')

function revisionKey() {
  try {
    const head = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim()
    const status = execSync('git status --porcelain', {encoding: 'utf8'})
    const diff = status ? execSync('git diff HEAD', {encoding: 'utf8'}) : ''
    return createHash('sha1')
      .update(head)
      .update('\0')
      .update(status)
      .update('\0')
      .update(diff)
      .digest('hex')
  } catch {
    return null // not a git checkout — disable caching
  }
}

function loadPassed(key) {
  if (!key || process.env.RELEASE_FORCE_E2E) return new Set()
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (data.key === key && Array.isArray(data.passed)) return new Set(data.passed)
  } catch {
    // missing/corrupt/stale cache — treat as empty
  }
  return new Set()
}

function savePassed(key, passed) {
  if (!key) return
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({key, passed: [...passed]}))
  } catch {
    // best-effort cache; a write failure just means no skip next time
  }
}

// ── device boot ──────────────────────────────────────────────────────────────────────
// Each ensure*Booted() returns a "teardown handle" identifying a device WE booted (so it
// can be shut down again afterwards), or null when the device was already running / boot
// was skipped — we only ever shut down what we started.
//
// Boot an iOS simulator if none is running. Picks the first available iPhone and waits
// for it to finish booting, then opens the Simulator UI.
function ensureIosBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return null
  let booted
  try {
    booted = execSync('xcrun simctl list devices booted', {encoding: 'utf8'})
  } catch {
    console.warn('   pre-release: xcrun simctl unavailable — skipping iOS auto-boot.')
    return null
  }
  if (/\bBooted\b/.test(booted)) {
    console.log('   iOS simulator already booted.')
    return null
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
  // Only offer a teardown handle when we know exactly which device we booted. Without a
  // udid we'd have to fall back to `simctl shutdown booted`, which kills every booted
  // simulator — including any the user opened — so leave it running instead.
  return udid ? {kind: 'ios', id: udid} : null
}

// Boot an Android emulator if none is running. Picks the first AVD, launches it
// detached, and waits for sys.boot_completed.
function ensureAndroidBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return null
  let devices
  try {
    devices = execSync(`"${ADB}" devices`, {encoding: 'utf8'})
  } catch {
    console.warn('   pre-release: adb unavailable — skipping Android auto-boot.')
    return null
  }
  if (/emulator-\d+\s+device/.test(devices)) {
    console.log('   Android emulator already booted.')
    return null
  }

  let avd
  try {
    avd = execSync(`"${EMULATOR}" -list-avds`, {encoding: 'utf8'})
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0]
  } catch {
    console.warn('   pre-release: emulator binary unavailable — skipping Android auto-boot.')
    return null
  }
  if (!avd) {
    console.warn('   pre-release: no Android AVD found — skipping Android auto-boot.')
    return null
  }

  console.log(`   Booting Android emulator (${avd})…`)
  const child = spawn(EMULATOR, ['-avd', avd, '-no-snapshot-save'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  try {
    execSync(`"${ADB}" wait-for-device`, {stdio: 'inherit', timeout: 120_000})
  } catch {
    console.warn('   pre-release: adb wait-for-device failed — continuing anyway.')
    return null
  }

  const timeoutMs = 180_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    let prop = ''
    try {
      // Bound each poll: `adb shell` can hang while the adb daemon respawns during a cold
      // boot, and a hung call would freeze the loop past its outer 3m ceiling.
      prop = execSync(`"${ADB}" shell getprop sys.boot_completed`, {
        encoding: 'utf8',
        timeout: 5_000,
      }).trim()
    } catch {
      // device not ready yet (or the poll timed out) — try again
    }
    if (prop === '1') {
      console.log('   Android emulator booted.')
      warmUpAndroidShareSheet()
      const serial = /(emulator-\d+)\s+device/.exec(
        execSync(`"${ADB}" devices`, {encoding: 'utf8', timeout: 5_000})
      )?.[1]
      return serial ? {kind: 'android', id: serial} : null
    }
    sleep(2)
  }
  console.warn('   pre-release: Android boot not confirmed within 3m — continuing anyway.')
  return null
}

// A freshly booted emulator isn't ready to render the system share sheet: the first
// ACTION_SEND can come up before the resolver has indexed share targets, which flakes
// share-sheet e2e (e.g. share-question-url asserts the shared URL shows in the sheet
// preview). Wait for the boot animation to end, dismiss the keyguard, then fire and
// dismiss a throwaway share chooser so the resolver is warm before the suite runs.
// Best-effort — any failure here must not block the gate.
function warmUpAndroidShareSheet() {
  // Every adb call here is bounded — they run during an unstable boot window where a hung
  // `adb shell` would otherwise stall the gate.
  try {
    const animDeadline = Date.now() + 60_000
    while (Date.now() < animDeadline) {
      let anim = ''
      try {
        anim = execSync(`"${ADB}" shell getprop init.svc.bootanim`, {
          encoding: 'utf8',
          timeout: 5_000,
        }).trim()
      } catch {
        // not ready / timed out — retry until the deadline
      }
      if (anim === 'stopped') break
      sleep(2)
    }
    execSync(`"${ADB}" shell wm dismiss-keyguard`, {stdio: 'ignore', timeout: 5_000})
    console.log('   Warming up the Android share sheet…')
    execSync(
      `"${ADB}" shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT warmup`,
      {stdio: 'ignore', timeout: 10_000}
    )
    sleep(2)
    execSync(`"${ADB}" shell input keyevent KEYCODE_BACK`, {stdio: 'ignore', timeout: 5_000})
    execSync(`"${ADB}" shell input keyevent KEYCODE_HOME`, {stdio: 'ignore', timeout: 5_000})
  } catch {
    // warm-up is best-effort; the suite still runs if it fails
  }
}

const boot = {ios: ensureIosBooted, android: ensureAndroidBooted}

// Shut down a device we booted. Best-effort — a teardown failure must never mask the
// gate's own pass/fail result. Skipped entirely if RELEASE_KEEP_DEVICES is set.
function teardown(handle) {
  if (!handle || process.env.RELEASE_KEEP_DEVICES) return
  try {
    if (handle.kind === 'ios') {
      console.log('   Shutting down iOS simulator we booted…')
      execSync(`xcrun simctl shutdown ${handle.id}`, {stdio: 'ignore'})
    } else if (handle.kind === 'android') {
      console.log(`   Shutting down Android emulator we booted (${handle.id})…`)
      execSync(`"${ADB}" -s ${handle.id} emu kill`, {stdio: 'ignore'})
    }
  } catch {
    console.warn('   pre-release: device shutdown failed — leaving it running.')
  }
}

// ── gate ───────────────────────────────────────────────────────────────────────────────
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

const key = revisionKey()
const passed = loadPassed(key)

console.log(
  `\n▶  pre-release: running Maestro e2e gate${only ? ` (${only})` : ''} (set RELEASE_SKIP_E2E=1 to skip)\n`
)

// Devices we boot are torn down once the run finishes (pass or fail), so a release leaves
// the machine in the state it found it.
const booted = []

for (const [id, label, device, cmd] of suites) {
  if (passed.has(id)) {
    console.log(
      `\n— ${label}: already passed for this revision — skipping (RELEASE_FORCE_E2E=1 to re-run).`
    )
    continue
  }
  console.log(`\n— ${label}: ${cmd}`)
  const handle = boot[id]()
  if (handle) booted.push(handle)
  try {
    execSync(cmd, {stdio: 'inherit'})
  } catch {
    booted.forEach(teardown)
    console.error(
      `\n✖  pre-release: ${label} e2e failed — aborting.\n` +
        `   Is the ${device} booted? If you must ship anyway, re-run with RELEASE_SKIP_E2E=1.\n`
    )
    process.exit(1)
  }
  passed.add(id)
  savePassed(key, passed)
}

booted.forEach(teardown)
console.log('\n✓  pre-release: e2e gate passed.\n')
