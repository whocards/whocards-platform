import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {assertUsableScenarioIds, prepareRun} from './prepare-run.mjs'

await test('freezes repeatable inputs, withholds answers, and refuses to replace a run', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'whocards-eval-test-'))
  t.after(() => rm(parent, {recursive: true, force: true}))
  const output = join(parent, 'run')
  const manifest = await prepareRun(output, 'test-model', 2)
  const expectations = JSON.parse(await readFile(join(output, 'expectations.json'), 'utf8'))
  assert.equal(manifest.jobs.length, expectations.length * 2)
  for (const [path, hash] of Object.entries(manifest.hashes)) {
    const bytes = await readFile(join(output, 'snapshot', path))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
  }
  for (const scenario of expectations) {
    const first = await readFile(join(output, 'jobs', `${scenario.id}-1.txt`), 'utf8')
    assert.equal(first, await readFile(join(output, 'jobs', `${scenario.id}-2.txt`), 'utf8'))
    assert.ok(first.endsWith(`${scenario.prompt}\n`))
    if (scenario.expect.note) assert.ok(!first.includes(scenario.expect.note))
  }
  const response = join(output, 'responses', 'A-1.txt')
  await writeFile(response, 'original evidence')
  await assert.rejects(prepareRun(output, 'test-model'), {code: 'EEXIST'})
  assert.equal(await readFile(response, 'utf8'), 'original evidence')
  await assert.rejects(prepareRun(join(parent, 'invalid'), 'test-model', 0))
  await assert.rejects(prepareRun(join(parent, 'missing-model'), ''))
})

await test('passes a scenario history to the job and keeps what to avoid out of it', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'whocards-eval-test-'))
  t.after(() => rm(parent, {recursive: true, force: true}))
  const output = join(parent, 'run')
  const promptsFile = fileURLToPath(new URL('../prompts-recent-questions.json', import.meta.url))
  const manifest = await prepareRun(output, 'test-model', 1, promptsFile)
  assert.equal(manifest.prompts, 'prompts-recent-questions.json')
  const expectations = JSON.parse(await readFile(join(output, 'expectations.json'), 'utf8'))
  for (const scenario of expectations) {
    const job = await readFile(join(output, 'jobs', `${scenario.id}-1.txt`), 'utf8')
    const history = JSON.stringify({recent_questions: scenario.recent_questions}, null, 2)
    assert.ok(job.includes(`--- RECENT QUESTIONS (passed by the host) ---\n${history}`))
    assert.ok(job.endsWith(`${scenario.prompt}\n`))
    assert.ok(!job.includes(scenario.expect.note))
  }
  assert.equal((await prepareRun(join(parent, 'plain'), 'test-model')).prompts, 'prompts.json')
  assert.ok(
    !(await readFile(join(parent, 'plain', 'jobs', 'A-1.txt'), 'utf8')).includes('RECENT QUESTIONS')
  )
})

await test('rejects scenario ids that cannot safely name a job file', () => {
  assertUsableScenarioIds([{id: 'A'}, {id: 'B-2'}, {id: 'c_3'}])
  assert.throws(() => assertUsableScenarioIds([]), /non-empty array/)
  assert.throws(() => assertUsableScenarioIds([{id: '../escaped'}]), /must match/)
  assert.throws(() => assertUsableScenarioIds([{id: 'a/b'}]), /must match/)
  assert.throws(() => assertUsableScenarioIds([{id: ''}]), /must match/)
  assert.throws(() => assertUsableScenarioIds([{prompt: 'no id'}]), /must match/)
  assert.throws(() => assertUsableScenarioIds([{id: 'A'}, {id: 'A'}]), /Duplicate scenario id A/)
})
