import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  MARKER,
  changedOldLines,
  greptileSummary,
  matchFindings,
  parseMarkerComment,
  touchesWindow,
  upsertRow,
} from './review-diff.mjs'

const f = (path, line) => ({path, line, summary: ''})

test('parses path:line findings from the marker comment only', () => {
  const body = `${MARKER}\n## Findings\n- \`src/a.ts:12\` — leaks a timer\nsrc/b.ts:40-44 - no timeout\nnot a finding`
  assert.deepEqual(parseMarkerComment(body), [
    {path: 'src/a.ts', line: 12, summary: 'leaks a timer'},
    {path: 'src/b.ts', line: 40, summary: 'no timeout'},
  ])
  assert.deepEqual(parseMarkerComment('src/a.ts:12 — no marker'), [])
})

test('matches on path within ±3 lines into three lists', () => {
  const greptile = [f('a.ts', 10), f('a.ts', 50), f('b.ts', 7)]
  const skill = [f('a.ts', 13), f('b.ts', 11), f('c.ts', 1)]
  const {greptileOnly, skillOnly, both} = matchFindings(greptile, skill)
  assert.deepEqual(both, [{greptile: greptile[0], skill: skill[0]}])
  assert.deepEqual(greptileOnly, [greptile[1], greptile[2]])
  assert.deepEqual(skillOnly, [skill[1], skill[2]])
})

test('pairs each skill finding once, nearest line first', () => {
  const {both, greptileOnly} = matchFindings([f('a.ts', 10), f('a.ts', 12)], [f('a.ts', 12)])
  assert.equal(both[0].greptile.line, 12)
  assert.equal(greptileOnly[0].line, 10)
})

test('acted-on means a changed line within ±3, not just the hunk context', () => {
  const patch = '@@ -20,7 +20,7 @@\n ctx\n ctx\n ctx\n-old\n+new\n ctx\n ctx\n ctx'
  assert.deepEqual(changedOldLines(patch), [23, 24])
  assert.equal(touchesWindow(patch, 26), true)
  assert.equal(touchesWindow(patch, 28), false)
  assert.equal(touchesWindow(patch, 19), false)
})

test('log rows replace the PR they name', () => {
  const log = '| PR | x |\n| -- | - |\n| 12 | old |\n'
  assert.equal(upsertRow(log, '| 12 | new |'), '| PR | x |\n| -- | - |\n| 12 | new |\n')
  assert.equal(upsertRow(log, '| 13 | n |'), `${log}| 13 | n |\n`)
})

test('Greptile summaries keep the badge and drop the markup', () => {
  const body =
    '\n<a href="#"><img alt="P1" src="https://x/p1.svg" align="top"></a> **No timeout on verify**\n\nmore'
  assert.equal(greptileSummary(body), 'P1 **No timeout on verify**')
})
