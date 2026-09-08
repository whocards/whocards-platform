import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {prepareRun} from './prepare-run.mjs'

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
