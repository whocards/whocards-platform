#!/usr/bin/env node
// Regenerates assets/pool-en.json from the repo pool so the skill can check
// duplicates without a checkout. Run from the repo root: node
// evals/whocards-questions/scripts/build-pool-snapshot.mjs [--check]
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const poolPath = join(here, '../../../packages/decks/src/pool/questions.json')
const outPath = join(here, '../../../skills/whocards-questions/assets/pool-en.json')

const pool = JSON.parse(readFileSync(poolPath, 'utf8'))
const snapshot = Object.fromEntries(
  Object.entries(pool)
    .toSorted(([a], [b]) => Number(a) - Number(b))
    .map(([id, q]) => [id, q.en])
)
const next = `${JSON.stringify(snapshot, null, 2)}\n`

if (process.argv.includes('--check')) {
  const current = readFileSync(outPath, 'utf8')
  if (current !== next) {
    console.error(
      'assets/pool-en.json is stale. Run: node evals/whocards-questions/scripts/build-pool-snapshot.mjs'
    )
    process.exit(1)
  }
  console.log('assets/pool-en.json is up to date')
} else {
  writeFileSync(outPath, next)
  console.log(`wrote ${Object.keys(snapshot).length} English questions to assets/pool-en.json`)
}
