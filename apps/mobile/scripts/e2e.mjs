// `pnpm -F mobile e2e [--device pro|plus|duo] [<flow ...>] [e2e run flags]` runs the flows in
// apps/mobile/e2e on a WhoCards device (default `WhoCards iPhone 17 Pro`) that has the app installed.
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync} from 'node:fs'
import path from 'node:path'

import {DEVICES, hasApp, MOBILE_DIR, prepare} from './devices.mjs'

const args = process.argv.slice(2)
const at = args.indexOf('--device')
const key = at === -1 ? 'pro' : args.splice(at, 2)[1]
const device = DEVICES[key]
if (!device) {
  console.error(`e2e: --device is one of ${Object.keys(DEVICES).join(', ')}`)
  process.exit(1)
}

const id = prepare(device)
if (!hasApp(id)) {
  console.error(
    `e2e: no WhoCards build on ${device.displayName ?? device.name}. ` +
      `\`pnpm release:check ${device.platform}\` builds and installs a Release one.`
  )
  process.exit(1)
}

// A bare flow name is its file; anything else (an e2e run flag) passes through.
const runArgs = args.map((arg) =>
  existsSync(path.join(MOBILE_DIR, 'e2e', `${arg}.e2e.ts`)) ? `e2e/${arg}.e2e.ts` : arg
)
// The store-screenshot flow runs only when asked for (`pnpm -F mobile screenshots`).
if (!runArgs.includes('--tag')) runArgs.push('--exclude-tag', 'screenshots')
if (process.env.SHOTS_DIR) mkdirSync(process.env.SHOTS_DIR, {recursive: true})

const {status, error} = spawnSync(
  path.join(MOBILE_DIR, 'node_modules/.bin/e2e'),
  ['run', '--target', device.platform, ...runArgs],
  {
    cwd: MOBILE_DIR,
    stdio: 'inherit',
    env: {...process.env, E2E_DEVICE: id, E2E_TELEMETRY_DISABLED: '1'},
  }
)
if (error) console.error(`e2e: ${error.message}`)
process.exitCode = status ?? 1
