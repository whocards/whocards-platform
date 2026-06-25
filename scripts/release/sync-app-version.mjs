#!/usr/bin/env node
// Sync the release version into apps/mobile/app.json (expo.version), the marketing
// version shown in the stores. EAS owns the build number (appVersionSource: remote,
// autoIncrement), so we only touch the human-facing version here.
//
// Invoked by release-it's after:bump hook with the new version as argv[2]. It also
// stages the file so release-it's release commit picks it up.

import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`sync-app-version: expected a semver version, got "${version ?? ''}"`)
  process.exit(1)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const appJsonPath = resolve(repoRoot, 'apps/mobile/app.json')

const app = JSON.parse(readFileSync(appJsonPath, 'utf8'))
const previous = app.expo?.version
if (!app.expo) {
  console.error('sync-app-version: apps/mobile/app.json has no expo block')
  process.exit(1)
}

if (previous === version) {
  console.log(`sync-app-version: app.json already at ${version}, nothing to do`)
} else {
  app.expo.version = version
  writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`)
  console.log(`sync-app-version: app.json ${previous} → ${version}`)
}

// Stage it (no-op in --dry-run since the file is unchanged there).
execFileSync('git', ['add', appJsonPath], {stdio: 'inherit'})
