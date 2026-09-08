#!/usr/bin/env node
import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const evalRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillRoot = resolve(evalRoot, '../../skills/whocards-questions')
const runtimeFiles = [
  'SKILL.md',
  'references/mission.md',
  'references/editorial-calibration.md',
  'assets/pool-en.json',
]

// Job files are named from scenario IDs, so an ID must be a safe, unique filename
// component. Check before anything is written: a partial run has no manifest and no
// expectations, which makes the evidence it did write unusable.
export function assertUsableScenarioIds(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('prompts.json must be a non-empty array of scenarios.')
  }
  const seen = new Set()
  for (const scenario of prompts) {
    const id = scenario?.id
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(`Scenario id must match [A-Za-z0-9_-]+; received ${JSON.stringify(id)}.`)
    }
    if (seen.has(id)) throw new Error(`Duplicate scenario id ${id}.`)
    seen.add(id)
  }
}

// Freeze exactly what the generator sees; keep reviewer expectations separate.
export async function prepareRun(output, model, repeats = 1) {
  if (!model?.trim()) throw new Error('Supply the model identifier used for generation.')
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10) {
    throw new Error('Repeats must be an integer from 1 to 10.')
  }
  const root = resolve(output)
  const prompts = JSON.parse(await readFile(join(evalRoot, 'prompts.json'), 'utf8'))
  assertUsableScenarioIds(prompts)
  const files = await Promise.all(
    runtimeFiles.map(async (path) => ({
      path,
      text: await readFile(join(skillRoot, path), 'utf8'),
    }))
  )
  // Intentionally fail if it exists: a second run must never replace evidence.
  await mkdir(root)
  await mkdir(join(root, 'snapshot'))
  await mkdir(join(root, 'jobs'))
  await mkdir(join(root, 'responses'))
  const hashes = {}
  for (const file of files) {
    const target = join(root, 'snapshot', file.path)
    await mkdir(dirname(target), {recursive: true})
    await writeFile(target, file.text, {flag: 'wx'})
    hashes[file.path] = createHash('sha256').update(file.text).digest('hex')
  }
  const jobs = []
  for (const scenario of prompts) {
    for (let sample = 1; sample <= repeats; sample++) {
      const id = `${scenario.id}-${sample}`
      jobs.push({id, scenario: scenario.id, sample, request: scenario.prompt})
      const request = [
        'Use the WhoCards question skill supplied below to answer the request at the end.',
        'Its referenced resources are included in full. Use this bundled pool for this standalone run.',
        ...files.map((file) => `\n--- FILE: ${file.path} ---\n${file.text}`),
        `\n--- USER REQUEST ---\n${scenario.prompt}\n`,
      ].join('\n')
      await writeFile(join(root, 'jobs', `${id}.txt`), request, {flag: 'wx'})
    }
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    requestedModel: model,
    mode: 'explicit skill, bundled resources, fresh conversation per job',
    repeats,
    hashes,
    jobs,
  }
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(root, 'expectations.json'), `${JSON.stringify(prompts, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , output, model, repeats = '1'] = process.argv
  if (!output || !model) {
    throw new Error('Usage: node prepare-run.mjs NEW_DIRECTORY MODEL [REPEATS]')
  }
  const manifest = await prepareRun(output, model, Number(repeats))
  console.log(`Prepared ${manifest.jobs.length} fresh-conversation jobs in ${resolve(output)}`)
}
