import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  MARKER,
  changedOldLines,
  commitsAfter,
  greptileFinding,
  greptileSummary,
  mapLine,
  matchFindings,
  parseMarkerComment,
  touchesWindow,
  upsertRow,
  verdict,
} from './review-diff.mjs'

const f = (path, line) => ({path, line, summary: ''})

void test('parses path:line findings from the marker comment only', () => {
  const body = `${MARKER}\n## Findings\n- \`src/a.ts:12\` — leaks a timer\nsrc/b.ts:40-44 - no timeout\nnot a finding`
  assert.deepEqual(parseMarkerComment(body), [
    {path: 'src/a.ts', line: 12, summary: 'leaks a timer'},
    {path: 'src/b.ts', line: 40, summary: 'no timeout'},
  ])
  assert.deepEqual(parseMarkerComment('src/a.ts:12 — no marker'), [])
})

void test('matches on path within ±3 lines into three lists', () => {
  const greptile = [f('a.ts', 10), f('a.ts', 50), f('b.ts', 7)]
  const skill = [f('a.ts', 13), f('b.ts', 11), f('c.ts', 1)]
  const {greptileOnly, skillOnly, both} = matchFindings(greptile, skill)
  assert.deepEqual(both, [{greptile: greptile[0], skill: skill[0]}])
  assert.deepEqual(greptileOnly, [greptile[1], greptile[2]])
  assert.deepEqual(skillOnly, [skill[1], skill[2]])
})

void test('pairs each skill finding once, nearest line first', () => {
  const {both, greptileOnly} = matchFindings([f('a.ts', 10), f('a.ts', 12)], [f('a.ts', 12)])
  assert.equal(both[0].greptile.line, 12)
  assert.equal(greptileOnly[0].line, 10)
})

void test('acted-on means a changed line within ±3, not just the hunk context', () => {
  const patch = '@@ -20,7 +20,7 @@\n ctx\n ctx\n ctx\n-old\n+new\n ctx\n ctx\n ctx'
  assert.deepEqual(changedOldLines(patch), [23, 24])
  assert.equal(touchesWindow(patch, 26), true)
  assert.equal(touchesWindow(patch, 28), false)
  assert.equal(touchesWindow(patch, 19), false)
})

void test('log rows replace the PR they name', () => {
  const log = '| PR | x |\n| -- | - |\n| 12 | old |\n'
  assert.equal(upsertRow(log, '| 12 | new |'), '| PR | x |\n| -- | - |\n| 12 | new |\n')
  assert.equal(upsertRow(log, '| 13 | n |'), `${log}| 13 | n |\n`)
})

void test('Greptile summaries keep the badge and drop the markup', () => {
  const body =
    '\n<a href="#"><img alt="P1" src="https://x/p1.svg" align="top"></a> **No timeout on verify**\n\nmore'
  assert.equal(greptileSummary(body), 'P1 **No timeout on verify**')
})

void test('Greptile findings keep the line numbered at the reviewed commit', () => {
  const c = {path: 'a.ts', line: 81, original_line: 75, original_commit_id: 'b', body: 'x'}
  assert.equal(greptileFinding(c).line, 75)
  assert.equal(greptileFinding({...c, original_line: null}).line, 81)
})

void test('later commits are those after the reviewed sha, and unknown once it is gone', () => {
  const commits = [{sha: 'a'}, {sha: 'b'}, {sha: 'c'}]
  assert.deepEqual(commitsAfter(commits, {commitId: 'b'}), ['c'])
  assert.equal(commitsAfter(commits, {commitId: 'gone'}), null)
})

void test('a line is carried past the hunks above it', () => {
  const insert10 = `@@ -1,1 +1,11 @@\n ctx\n${'+x\n'.repeat(10)}`
  assert.equal(mapLine(insert10, 50), 60)
  assert.equal(mapLine(insert10, 1), 1)
  assert.equal(mapLine('@@ -40,3 +40,2 @@\n ctx\n-gone\n ctx', 50), 49)
  assert.equal(mapLine('@@ -40,3 +40,2 @@\n ctx\n-gone\n ctx', 42), 41)
  assert.equal(mapLine('@@ -60,1 +60,2 @@\n ctx\n+x', 50), 50)
})

void test('verdict follows the finding through earlier commits', () => {
  const insert10 = `@@ -1,1 +1,11 @@\n ctx\n${'+x\n'.repeat(10)}`
  const fixAt60 = '@@ -59,3 +59,3 @@\n ctx\n-old\n+new\n ctx'
  const files = {a: [{filename: 'a.ts', patch: insert10}], b: [{filename: 'a.ts', patch: fixAt60}]}
  const finding = {path: 'a.ts', line: 50}
  assert.equal(
    verdict(finding, ['a', 'b'], (sha) => files[sha]),
    'acted-on'
  )
  // the same edit at the finding's old number is now 10 lines away from it
  const fixAt50 = '@@ -49,3 +49,3 @@\n ctx\n-old\n+new\n ctx'
  assert.equal(
    verdict(
      finding,
      ['a', 'c'],
      (sha) => ({...files, c: [{filename: 'a.ts', patch: fixAt50}]})[sha]
    ),
    'ignored'
  )
  assert.equal(
    verdict(finding, null, () => []),
    'unknown'
  )
  assert.equal(
    verdict({...finding, thumbsDown: true}, null, () => []),
    'thumbs-down'
  )
})
