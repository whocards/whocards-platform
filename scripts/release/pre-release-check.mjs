#!/usr/bin/env node
// Mobile e2e gate (apps/mobile/e2e). Run by release-it's before:init hook (both platforms), by the
// mobile:rebuild:* scripts (one platform), and standalone via `pnpm release:check`.
//
// CI (ci.yml) already covers lint + typecheck + unit tests on every push to
// main, so by the time you ship, those are green. What CI does NOT run is the mobile
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
// The gate runs only on WhoCards' own devices (apps/mobile/scripts/devices.mjs): the
// `WhoCards iPhone 17 Pro` simulator, slimmed with simslim, and the `WhoCards Duo` emulator.
// Each is created and booted before its suite runs (set RELEASE_SKIP_BOOT=1 to boot them
// yourself). Skip the whole gate with RELEASE_SKIP_E2E=1
// (and run the flows yourself, or accept the risk for a hotfix).
//
// Before each platform's suite, we make sure a CURRENT app is actually installed on the
// booted device — `pnpm -F mobile e2e` has no build/install step of its own. We build a self-contained Release sim/emulator
// app (JS embedded, no Metro dependency needed) and install it whenever the installed
// app is missing or was built from a different revision. Skip just the build (e.g. you
// already installed a build yourself) with RELEASE_SKIP_BUILD=1 — the suite still runs.
// That's distinct from RELEASE_SKIP_E2E=1, which skips the whole gate.
//
// A platform that passes is recorded against the current git revision in a temp file, so
// a re-run on the same code skips both the rebuild and the suite (e.g. iOS passed but
// Android failed → fix Android, re-run, only Android rebuilds/retests). The record is
// invalidated as soon as the tree changes, and is never trusted if the app isn't actually
// installed on the booted device anymore (e.g. you erased the simulator). Force a full
// re-run with RELEASE_FORCE_E2E=1 (or delete the file).

import {execSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  ADB,
  bootSimulator,
  bootedSimulator,
  DEVICES,
  emulatorSerial,
  ensureAvd,
  ensureSimulator,
  hasApp,
  startEmulator,
  waitForEmulator,
} from '../../apps/mobile/scripts/devices.mjs'

const only = process.argv[2]?.toLowerCase()
if (only && only !== 'ios' && only !== 'android') {
  console.error(`pre-release: unknown platform "${only}" (expected "ios" or "android")`)
  process.exit(1)
}

// Coarse synchronous sleep so we can poll for boot completion without async.
const sleep = (seconds) => execSync(`sleep ${seconds}`)

// This script is always invoked as `node scripts/release/pre-release-check.mjs` (or via a
// pnpm script that shells out to the same), so resolve paths from its own location rather
// than assuming process.cwd() is the repo root.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MOBILE_DIR = path.join(REPO_ROOT, 'apps', 'mobile')
const IOS_DIR = path.join(MOBILE_DIR, 'ios')
const ANDROID_DIR = path.join(MOBILE_DIR, 'android')

const SIM = DEVICES.pro
const AVD = DEVICES.duo

// ── per-revision cache ─────────────────────────────────────────────────────────────────
// Keyed to HEAD + working-tree state, so it only short-circuits when nothing changed. One
// record per platform tracks both "built" (a Release app for this revision was installed)
// and "passed" (the e2e suite passed against that install) — a single coherent structure
// instead of two drifting caches. `version` lets us safely reshape this later: a cache
// written by an older version of this script is just treated as empty.
const CACHE_FILE = path.join(os.tmpdir(), 'whocards-prerelease-e2e.json')
const CACHE_VERSION = 2

function revisionKey() {
  try {
    const head = execSync('git rev-parse HEAD', {encoding: 'utf8'}).trim()
    const status = execSync('git status --porcelain', {encoding: 'utf8'})
    const diff = status ? execSync('git diff HEAD', {encoding: 'utf8'}) : ''
    const hash = createHash('sha1')
      .update(head)
      .update('\0')
      .update(status)
      .update('\0')
      .update(diff)
    // `git diff HEAD` covers tracked changes but not untracked files, which `status` only
    // names — fold their contents in too so editing an untracked file busts the cache.
    const untracked = execSync('git ls-files --others --exclude-standard -z', {encoding: 'utf8'})
      .split('\0')
      .filter(Boolean)
    for (const file of untracked) {
      try {
        hash.update('\0').update(file).update('\0').update(readFileSync(file))
      } catch {
        // unreadable (e.g. removed mid-run) — skip
      }
    }
    return hash.digest('hex')
  } catch {
    return null // not a git checkout — disable caching
  }
}

function emptyCache(key) {
  return {version: CACHE_VERSION, key, platforms: {}}
}

function loadCache(key) {
  if (!key || process.env.RELEASE_FORCE_E2E) return emptyCache(key)
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (data.version === CACHE_VERSION && data.key === key && data.platforms) {
      return data
    }
  } catch {
    // missing/corrupt/stale/older-shape cache — treat as empty
  }
  return emptyCache(key)
}

function saveCache(cache) {
  if (!cache.key) return
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache))
  } catch {
    // best-effort cache; a write failure just means no skip next time
  }
}

function platformState(cache, id) {
  return cache.platforms[id] ?? {built: false, passed: false}
}

// ── install checks ───────────────────────────────────────────────────────────────────
// A cached "built"/"passed" record for this revision must never be trusted blindly — the
// simulator could've been erased, or the emulator swapped, since the last run. These
// confirm the app is actually on the currently-booted device right now.
function getBootedIosUdid() {
  try {
    return bootedSimulator(SIM)
  } catch {
    return null // xcrun unavailable
  }
}

const getBootedAndroidSerial = () => emulatorSerial(AVD)

// ── self-provisioning build ─────────────────────────────────────────────────────────────
// ios/ and android/ are gitignored Expo prebuild output — generate them if this is a
// fresh checkout. `pnpm with-env` (defined in apps/mobile/package.json) loads the repo
// root .env so EXPO_PUBLIC_* vars get inlined the same way `expo start`/`expo run:*` do.
function ensurePrebuild(platform) {
  const dir = platform === 'ios' ? IOS_DIR : ANDROID_DIR
  if (existsSync(dir)) return
  console.log(`   No ${platform}/ directory — running expo prebuild -p ${platform}…`)
  // CI=1 is expo's own signal to skip interactive prompts (a bare --non-interactive flag
  // doesn't exist on this expo-cli version and just prints a warning).
  execSync(`pnpm with-env expo prebuild -p ${platform} --pnpm`, {
    cwd: MOBILE_DIR,
    stdio: 'inherit',
    env: {...process.env, CI: '1'},
  })
}

function findIosWorkspace() {
  const workspace = readdirSync(IOS_DIR).find((f) => f.endsWith('.xcworkspace'))
  if (!workspace) throw new Error('no .xcworkspace found in ios/ after prebuild')
  return path.join(IOS_DIR, workspace)
}

function findIosScheme(workspace) {
  const out = execSync(`xcodebuild -workspace "${workspace}" -list`, {encoding: 'utf8'})
  const schemes = (out.split('Schemes:')[1] ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  // The workspace an Expo prebuild generates always has a scheme named after the app
  // itself (matching the .xcworkspace's own basename) — everything else listed is a pod
  // target (Pods-*) or one of its transitive dependency schemes (ExpoModulesJSI,
  // EASClient, etc.), which xcodebuild would happily "build" into nothing installable.
  const appScheme = path.basename(workspace, path.extname(workspace))
  if (schemes.includes(appScheme)) return appScheme
  const fallback = schemes.find((s) => !/pods/i.test(s))
  if (!fallback) throw new Error('could not determine an Xcode scheme from the workspace')
  return fallback
}

// Builds a self-contained Release simulator app (JS bundle embedded, no Metro needed at
// runtime) and installs it on the given booted simulator. Sim builds need no signing, but
// `-allowProvisioningUpdates` keeps xcodebuild from stalling on a cert prompt regardless.
function buildAndInstallIos(udid) {
  ensurePrebuild('ios')
  const workspace = findIosWorkspace()
  const scheme = findIosScheme(workspace)
  const derivedDataPath = path.join(IOS_DIR, 'build')
  const buildCmd =
    `pnpm with-env xcodebuild -workspace "${workspace}" -scheme "${scheme}" ` +
    `-configuration Release -sdk iphonesimulator -destination "id=${udid}" ` +
    `-derivedDataPath "${derivedDataPath}" -allowProvisioningUpdates build`
  console.log(`   Building Release iOS sim app (scheme "${scheme}")… this can take a while.`)
  try {
    execSync(buildCmd, {cwd: MOBILE_DIR, stdio: 'inherit'})
  } catch {
    // Known react-native/Expo new-architecture flake on a from-scratch derived data dir:
    // the ReactCodegen script phase that generates its own .cpp sources can lose the race
    // against the compile step that consumes them ("Build input file cannot be found").
    // The codegen output is on disk by the time the build fails, so a single retry is
    // reliably a clean incremental build, not a full rebuild — cheap enough to just do it
    // rather than surface a false failure.
    console.warn(
      '   pre-release: iOS build failed (possible codegen race on a fresh build) — retrying once…'
    )
    execSync(buildCmd, {cwd: MOBILE_DIR, stdio: 'inherit'})
  }
  const productsDir = path.join(derivedDataPath, 'Build', 'Products', 'Release-iphonesimulator')
  const appName = existsSync(productsDir)
    ? readdirSync(productsDir).find((f) => f.endsWith('.app'))
    : null
  if (!appName) throw new Error('iOS build finished but produced no .app bundle')
  const appPath = path.join(productsDir, appName)
  console.log(`   Installing ${appName} on ${udid}…`)
  execSync(`xcrun simctl install ${udid} "${appPath}"`, {stdio: 'inherit'})
}

// JDK 17 is required for the current Gradle/AGP pin; `/usr/libexec/java_home` finds it on
// macOS regardless of what's first on PATH (a newer JDK often is). Falls back to whatever
// JAVA_HOME is already set so this doesn't hard-fail on non-Homebrew setups — gradlew will
// complain loudly and specifically if the version is wrong.
function findJdk17() {
  try {
    return execSync('/usr/libexec/java_home -v 17', {encoding: 'utf8'}).trim()
  } catch {
    return process.env.JAVA_HOME
  }
}

// Builds a self-contained Release APK (JS bundle embedded) and installs it on the given
// booted emulator.
function buildAndInstallAndroid(serial) {
  ensurePrebuild('android')
  const javaHome = findJdk17()
  console.log('   Building Release Android app (:app:assembleRelease)… this can take a while.')
  // Release lint crashes in analysis, and KSP outgrows the generated gradle.properties' Metaspace.
  const gradle =
    'pnpm with-env android/gradlew -p android :app:assembleRelease -x lintVitalAnalyzeRelease ' +
    '"-Porg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g"'
  execSync(gradle, {
    cwd: MOBILE_DIR,
    stdio: 'inherit',
    env: javaHome ? {...process.env, JAVA_HOME: javaHome} : process.env,
  })
  const apkDir = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release')
  const apkName = existsSync(apkDir) ? readdirSync(apkDir).find((f) => f.endsWith('.apk')) : null
  if (!apkName) throw new Error('Android build finished but produced no .apk')
  const apkPath = path.join(apkDir, apkName)
  console.log(`   Installing ${apkName} on ${serial}…`)
  execSync(`"${ADB}" -s ${serial} install -r "${apkPath}"`, {stdio: 'inherit'})
}

const getBootedDevice = {ios: getBootedIosUdid, android: getBootedAndroidSerial}
const buildAndInstall = {ios: buildAndInstallIos, android: buildAndInstallAndroid}

// ── device boot ──────────────────────────────────────────────────────────────────────
// Each ensure*Booted() returns a "teardown handle" identifying a device WE booted (so it
// can be shut down again afterwards), or null when the device was already running / boot
// was skipped — we only ever shut down what we started.
//
// Create and boot the WhoCards simulator if it isn't running, and slim it either way.
function ensureIosBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return null
  let sim
  try {
    sim = ensureSimulator(SIM)
  } catch (err) {
    console.warn(`   pre-release: ${err.message} — skipping iOS auto-boot.`)
    return null
  }
  const wasBooted = sim.state === 'Booted'
  console.log(`   ${wasBooted ? 'Slimming' : 'Booting'} ${SIM.name} (${sim.udid})…`)
  try {
    bootSimulator(sim)
  } catch (err) {
    console.warn(`   pre-release: could not boot or slim ${SIM.name} — ${err.message}`)
  }
  try {
    execSync('open -a Simulator', {stdio: 'ignore'})
  } catch {
    // headless boot still works for the flows even if the UI doesn't open
  }
  return wasBooted ? null : {kind: 'ios', id: sim.udid}
}

// Create and boot the WhoCards Duo emulator if it isn't running, and wait for boot_completed.
function ensureAndroidBooted() {
  if (process.env.RELEASE_SKIP_BOOT) return null
  if (emulatorSerial(AVD)) {
    console.log(`   ${AVD.displayName} already booted.`)
    return null
  }
  try {
    ensureAvd(AVD)
  } catch (err) {
    console.warn(`   pre-release: ${err.message} — skipping Android auto-boot.`)
    return null
  }
  const child = startEmulator(AVD)

  // Every path below must return this handle, or we'd leak the emulator we started; the
  // serial (for a graceful `emu kill`) is filled in once it boots, the pid is the fallback.
  const handle = {kind: 'android', id: null, pid: child.pid}
  handle.id = waitForEmulator(AVD)
  if (!handle.id) {
    console.warn(`   pre-release: ${AVD.displayName} boot not confirmed — continuing anyway.`)
    return handle
  }
  console.log(`   ${AVD.displayName} booted.`)
  warmUpAndroidShareSheet(handle.id)
  return handle
}

// A freshly booted emulator isn't ready to render the system share sheet: the first
// ACTION_SEND can come up before the resolver has indexed share targets, which flakes
// share-sheet e2e (e.g. share-question-url asserts the shared URL shows in the sheet
// preview). Wait for the boot animation to end, dismiss the keyguard, then fire and
// dismiss a throwaway share chooser so the resolver is warm before the suite runs.
// Best-effort — any failure here must not block the gate.
function warmUpAndroidShareSheet(serial) {
  // Every adb call here is bounded — they run during an unstable boot window where a hung
  // `adb shell` would otherwise stall the gate.
  try {
    const animDeadline = Date.now() + 60_000
    while (Date.now() < animDeadline) {
      let anim = ''
      try {
        anim = execSync(`"${ADB}" -s ${serial} shell getprop init.svc.bootanim`, {
          encoding: 'utf8',
          timeout: 5_000,
        }).trim()
      } catch {
        // not ready / timed out — retry until the deadline
      }
      if (anim === 'stopped') break
      sleep(2)
    }
    execSync(`"${ADB}" -s ${serial} shell wm dismiss-keyguard`, {stdio: 'ignore', timeout: 5_000})
    console.log('   Warming up the Android share sheet…')
    execSync(
      `"${ADB}" -s ${serial} shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT warmup`,
      {stdio: 'ignore', timeout: 10_000}
    )
    sleep(2)
    execSync(`"${ADB}" -s ${serial} shell input keyevent KEYCODE_BACK`, {
      stdio: 'ignore',
      timeout: 5_000,
    })
    execSync(`"${ADB}" -s ${serial} shell input keyevent KEYCODE_HOME`, {
      stdio: 'ignore',
      timeout: 5_000,
    })
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
      console.log(
        `   Shutting down Android emulator we booted${handle.id ? ` (${handle.id})` : ''}…`
      )
      if (handle.id) {
        // Graceful console kill once the device registered with adb.
        execSync(`"${ADB}" -s ${handle.id} emu kill`, {stdio: 'ignore', timeout: 10_000})
      } else if (handle.pid) {
        // Boot never got far enough for a serial — kill the detached process group we
        // spawned (negative pid; the emulator is its own group leader via detached:true).
        try {
          process.kill(-handle.pid)
        } catch {
          process.kill(handle.pid)
        }
      }
    }
  } catch {
    console.warn('   pre-release: device shutdown failed — leaving it running.')
  }
}

// ── gate ───────────────────────────────────────────────────────────────────────────────
if (process.env.RELEASE_SKIP_E2E) {
  console.warn(
    '\n⚠️  pre-release: RELEASE_SKIP_E2E set — skipping the mobile e2e gate.\n' +
      '   Make sure the flows passed some other way before you ship.\n'
  )
  process.exit(0)
}

const allSuites = [
  ['ios', 'iOS', SIM.name, 'pnpm --filter mobile e2e --device pro'],
  ['android', 'Android', AVD.displayName, 'pnpm --filter mobile e2e --device duo'],
]
const suites = only ? allSuites.filter(([id]) => id === only) : allSuites

const key = revisionKey()
const cache = loadCache(key)

console.log(
  `\n▶  pre-release: running the mobile e2e gate${only ? ` (${only})` : ''} (set RELEASE_SKIP_E2E=1 to skip)\n`
)

// Devices we boot are torn down once the run finishes (pass or fail), so a release leaves
// the machine in the state it found it.
const booted = []

for (const [id, label, device, cmd] of suites) {
  const handle = boot[id]()
  if (handle) booted.push(handle)

  const deviceId = getBootedDevice[id]()
  const installed = Boolean(deviceId) && hasApp(deviceId)
  const state = platformState(cache, id)

  if (process.env.RELEASE_SKIP_BUILD) {
    console.log(`\n— ${label}: RELEASE_SKIP_BUILD set — assuming the installed build is current.`)
  } else if (state.built && installed) {
    console.log(`\n— ${label}: already built + installed for this revision — skipping build.`)
  } else {
    if (!deviceId) {
      booted.forEach(teardown)
      console.error(`\n✖  pre-release: no booted ${device} found to build for — aborting.\n`)
      process.exit(1)
    }
    console.log(`\n— ${label}: installing a fresh Release build (missing or stale)…`)
    try {
      buildAndInstall[id](deviceId)
    } catch (err) {
      booted.forEach(teardown)
      console.error(
        `\n✖  pre-release: ${label} build/install failed — aborting.\n` +
          `   ${err.message}\n` +
          `   Skip with RELEASE_SKIP_BUILD=1 if you already have a current build installed.\n`
      )
      process.exit(1)
    }
    state.built = true
    state.passed = false // a fresh install invalidates any previously recorded pass
    cache.platforms[id] = state
    saveCache(cache)
  }

  if (state.passed && installed) {
    console.log(
      `\n— ${label}: already passed for this revision — skipping (RELEASE_FORCE_E2E=1 to re-run).`
    )
    continue
  }

  if (!deviceId) {
    booted.forEach(teardown)
    console.error(`\n✖  pre-release: ${device} isn't booted — aborting.\n`)
    process.exit(1)
  }
  console.log(`\n— ${label}: ${cmd}`)
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
  state.passed = true
  cache.platforms[id] = state
  saveCache(cache)
}

booted.forEach(teardown)
console.log('\n✓  pre-release: e2e gate passed.\n')
