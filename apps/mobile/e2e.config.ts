// The device flows in e2e/; `pnpm -F mobile e2e` picks the WhoCards device and passes it as E2E_DEVICE.
import {join} from 'node:path'

import {mobile} from '@e2e-dev/mobile'
import type {E2EConfig} from 'e2e'

import {APP_ID, screenshot} from './scripts/devices.mjs'

const device = process.env.E2E_DEVICE
const shots = process.env.SHOTS_DIR

export default {
  targets: [
    {name: 'ios', engine: mobile({platform: 'ios', device}), app: {bundleId: APP_ID.ios}},
    {
      name: 'android',
      engine: mobile({platform: 'android', device}),
      app: {bundleId: APP_ID.android},
    },
  ],
  tests: 'e2e/**/*.e2e.ts',
  reporters: [
    'list',
    {
      name: 'whocards-shots',
      // With SHOTS_DIR set (the factory's device stage), each flow's last screen as <flow>.png.
      onEvent(event) {
        if (event.type !== 'test-finished' || event.result.status === 'skipped') return
        if (!shots || !device) return
        const flow = event.result.test.file.replace(/^.*\//, '').replace(/\.e2e\.ts$/, '')
        try {
          screenshot(device, join(shots, `${flow}.png`))
        } catch (error) {
          console.error(`e2e: no screenshot of ${flow}: ${String(error)}`)
        }
      },
    },
  ],
  output: '.e2e',
  workers: 1,
  retries: 0,
  timeout: 5 * 60_000,
  launchTimeout: 180_000,
  actionTimeout: 30_000,
  video: 'off',
  trace: 'off',
} satisfies E2EConfig
