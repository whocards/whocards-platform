#!/usr/bin/env node
// WhoCards' own simulators and emulator. Other projects keep devices on this Mac, so every
// WhoCards script boots, slims and picks only these.
//
//   node scripts/devices.mjs                 create any that are missing, and list them
//   node scripts/devices.mjs prepare <key>   also boot it (and slim an iOS one), then print its id
import {execFileSync, spawn} from 'node:child_process'
import {appendFileSync, existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const MOBILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const DEVICES = {
  pro: {
    platform: 'ios',
    name: 'WhoCards iPhone 17 Pro',
    type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
  },
  // The App Store's required 6.5" screenshot slot (1284×2778).
  plus: {
    platform: 'ios',
    name: 'WhoCards iPhone 14 Plus',
    type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14-Plus',
  },
  // Surface Duo images are x86_64-only and don't run on Apple silicon, so a foldable stands in.
  duo: {
    platform: 'android',
    name: 'WhoCards_Duo',
    displayName: 'WhoCards Duo',
    hardware: 'pixel_9_pro_fold',
    image: 'system-images;android-35;google_apis;arm64-v8a',
  },
}

const log = (text) => console.error(`devices: ${text}`)
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts}).trim()
const ok = (cmd, args, opts) => {
  try {
    run(cmd, args, opts)
    return true
  } catch {
    return false
  }
}
const simctl = (...args) => run('xcrun', ['simctl', ...args], {timeout: 300_000})

// ── iOS ────────────────────────────────────────────────────────────────────────────────

const simulators = () =>
  Object.values(JSON.parse(simctl('list', 'devices', 'available', '-j')).devices).flat()

// shortcut: iOS 27 kills a build from the iOS 27 SDK that hasn't adopted UIScene, which this app hasn't; raise once it has.
const IOS_MAX_MAJOR = 26

/** The simulator named `device.name`, created on the newest runtime (up to IOS_MAX_MAJOR) that runs its model. */
export function ensureSimulator(device) {
  const found = simulators().find((d) => d.name === device.name)
  if (found) return found
  const runtime = JSON.parse(simctl('list', 'runtimes', 'available', '-j'))
    .runtimes.filter(
      (r) =>
        r.platform === 'iOS' &&
        Number.parseInt(r.version, 10) <= IOS_MAX_MAJOR &&
        r.supportedDeviceTypes?.some((t) => t.identifier === device.type)
    )
    .toSorted((a, b) => a.version.localeCompare(b.version, undefined, {numeric: true}))
    .at(-1)
  if (!runtime) throw new Error(`no installed iOS runtime runs ${device.type}`)
  log(`creating ${device.name} on ${runtime.name}`)
  const udid = simctl('create', device.name, device.type, runtime.identifier)
  return {udid, name: device.name, state: 'Shutdown'}
}

/** Boots the simulator and slims it to simslim.json; slimming reboots it. */
export function bootSimulator(sim) {
  if (sim.state !== 'Booted') {
    log(`booting ${sim.name}`)
    ok('xcrun', ['simctl', 'boot', sim.udid])
  }
  simctl('bootstatus', sim.udid, '-b')
  slim(sim)
}

function slim(sim) {
  if (!ok('which', ['simslim'])) {
    log('simslim not installed, so not slimming (brew install mobai-app/tap/simslim)')
    return
  }
  const profile = path.join(MOBILE_DIR, 'simslim.json')
  if (ok('simslim', ['verify', sim.udid, '--profile', profile], {timeout: 60_000})) return
  log(`slimming ${sim.name}, which reboots it`)
  run('simslim', ['on', sim.udid, '--profile', profile], {timeout: 900_000})
}

/** The udid of the named WhoCards simulator when it's booted. */
export const bootedSimulator = (device) =>
  simulators().find((d) => d.name === device.name && d.state === 'Booted')?.udid ?? null

// ── Android ────────────────────────────────────────────────────────────────────────────

const SDK =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(os.homedir(), 'Library', 'Android', 'sdk')
const tool = (subdir, name) => {
  const candidate = path.join(SDK, subdir, name)
  return existsSync(candidate) ? candidate : name
}
export const ADB = tool('platform-tools', 'adb')
export const EMULATOR = tool('emulator', 'emulator')
const SDKMANAGER = tool('cmdline-tools/latest/bin', 'sdkmanager')
const AVDMANAGER = tool('cmdline-tools/latest/bin', 'avdmanager')

const avdConfig = (avd) =>
  path.join(os.homedir(), '.android', 'avd', `${avd.name}.avd`, 'config.ini')

/** The AVD named `avd.name`, created from its system image (installed when missing). */
export function ensureAvd(avd) {
  if (existsSync(avdConfig(avd))) return
  if (!existsSync(path.join(SDK, ...avd.image.split(';')))) {
    log(`installing ${avd.image}`)
    run(SDKMANAGER, ['--install', avd.image], {input: 'y\n', timeout: 1_800_000})
  }
  log(`creating ${avd.displayName} (${avd.name}, ${avd.hardware})`)
  run(AVDMANAGER, ['create', 'avd', '-n', avd.name, '-k', avd.image, '-d', avd.hardware], {
    input: 'no\n',
  })
  appendFileSync(avdConfig(avd), `avd.ini.displayname=${avd.displayName}\n`)
}

/** The adb serial of the running emulator of this AVD, or null; other emulators are never picked. */
export function emulatorSerial(avd) {
  let devices
  try {
    devices = run(ADB, ['devices'], {timeout: 10_000})
  } catch {
    return null
  }
  for (const [, serial] of devices.matchAll(/^(emulator-\d+)\s+device$/gm)) {
    try {
      const name = run(ADB, ['-s', serial, 'emu', 'avd', 'name'], {timeout: 10_000})
      if (name.split('\n')[0].trim() === avd.name) return serial
    } catch {
      // that emulator's console didn't answer; it isn't ours to use either way
    }
  }
  return null
}

/** Starts the AVD's emulator detached and returns its process; the caller waits for the serial. */
export function startEmulator(avd) {
  log(`booting ${avd.displayName}`)
  const child = spawn(EMULATOR, ['-avd', avd.name, '-no-snapshot-save', '-gpu', 'host'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

/** Polls until the AVD's emulator is online with boot completed; returns its serial or null. */
export function waitForEmulator(avd, timeoutMs = 240_000) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline;) {
    const serial = emulatorSerial(avd)
    if (serial) {
      try {
        const done = run(ADB, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
          timeout: 5_000,
        })
        if (done === '1') return serial
      } catch {
        // adb shell can hang or fail while the device is still coming up
      }
    }
    execFileSync('sleep', ['2'])
  }
  return null
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────

function ensure(device) {
  if (device.platform === 'ios') return ensureSimulator(device).udid
  ensureAvd(device)
  return device.name
}

/** Creates, boots and (iOS) slims the device; returns its udid or adb serial. */
export function prepare(device) {
  if (device.platform === 'ios') {
    const sim = ensureSimulator(device)
    bootSimulator(sim)
    return sim.udid
  }
  ensureAvd(device)
  if (!emulatorSerial(device)) startEmulator(device)
  const serial = waitForEmulator(device)
  if (!serial) throw new Error(`${device.displayName} did not finish booting`)
  return serial
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, key] = process.argv.slice(2)
  if (command === 'prepare') {
    const device = DEVICES[key]
    if (!device) {
      log(`unknown device "${key}"; one of ${Object.keys(DEVICES).join(', ')}`)
      process.exit(1)
    }
    console.log(prepare(device))
  } else if (command) {
    log(`unknown command "${command}"`)
    process.exit(1)
  } else {
    for (const [k, device] of Object.entries(DEVICES))
      console.log(`${k}\t${device.displayName ?? device.name}\t${ensure(device)}`)
  }
}
