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
// Before each platform's suite, we make sure a CURRENT app is actually installed on the
// booted device — `e2e:ios`/`e2e:android` are bare `maestro test` invocations with no
// build/install step of their own, so without this a fresh device dies instantly with
// "Failed to get app binary directory". We build a self-contained Release sim/emulator
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

import {execSync, spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

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
const APP_ID = {ios: 'cc.whocards.mobile', android: 'com.whocards.mobile'}

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
    const {devices} = JSON.parse(
      execSync('xcrun simctl list devices booted --json', {encoding: 'utf8'})
    )
    for (const list of Object.values(devices)) {
      const booted = list.find((d) => d.state === 'Booted')
      if (booted) return booted.udid
    }
  } catch {
    // xcrun unavailable — no udid to report
  }
  return null
}

function getBootedAndroidSerial() {
  try {
    const serial = /(emulator-\d+)\s+device/.exec(
      execSync(`"${ADB}" devices`, {encoding: 'utf8'})
    )?.[1]
    return serial ?? null
  } catch {
    return null
  }
}

function isIosAppInstalled(udid) {
  if (!udid) return false
  try {
    execSync(`xcrun simctl get_app_container ${udid} ${APP_ID.ios} app`, {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

function isAndroidAppInstalled(serial) {
  if (!serial) return false
  try {
    const out = execSync(`"${ADB}" -s ${serial} shell pm path ${APP_ID.android}`, {
      encoding: 'utf8',
    })
    return out.includes('package:')
  } catch {
    return false
  }
}

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
  execSync('pnpm with-env android/gradlew :app:assembleRelease', {
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
const isAppInstalled = {ios: isIosAppInstalled, android: isAndroidAppInstalled}
const buildAndInstall = {ios: buildAndInstallIos, android: buildAndInstallAndroid}

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

  // Register teardown for the process we just spawned right away. Every path below this
  // point (wait-for-device failure, boot never confirmed, no serial) must still return
  // this handle, or we'd leak the emulator we started. The adb serial — preferred for a
  // graceful `emu kill` — is filled in once the device registers; the pid is the fallback.
  const handle = {kind: 'android', id: null, pid: child.pid}
  const captureSerial = () => {
    try {
      handle.id =
        /(emulator-\d+)\s+device/.exec(
          execSync(`"${ADB}" devices`, {encoding: 'utf8', timeout: 5_000})
        )?.[1] ?? handle.id
    } catch {
      // adb unavailable — keep whatever serial we already had (maybe none; pid covers it)
    }
  }

  try {
    execSync(`"${ADB}" wait-for-device`, {stdio: 'inherit', timeout: 120_000})
  } catch {
    console.warn('   pre-release: adb wait-for-device failed — continuing anyway.')
    return handle
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
      captureSerial()
      return handle
    }
    sleep(2)
  }
  console.warn('   pre-release: Android boot not confirmed within 3m — continuing anyway.')
  captureSerial()
  return handle
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
const cache = loadCache(key)

console.log(
  `\n▶  pre-release: running Maestro e2e gate${only ? ` (${only})` : ''} (set RELEASE_SKIP_E2E=1 to skip)\n`
)

// Devices we boot are torn down once the run finishes (pass or fail), so a release leaves
// the machine in the state it found it.
const booted = []

for (const [id, label, device, cmd] of suites) {
  const handle = boot[id]()
  if (handle) booted.push(handle)

  const deviceId = getBootedDevice[id]()
  const installed = isAppInstalled[id](deviceId)
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
