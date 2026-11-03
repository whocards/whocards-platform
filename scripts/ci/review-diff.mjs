#!/usr/bin/env node
// Compare Greptile's inline comments on a PR with the /code-review findings the PR carries,
// and say whether each Greptile-only finding was acted on. Method: docs/spikes/0003 §C.
//
//   node scripts/ci/review-diff.mjs <pr> [<pr> ...] [--log]
//
// The /code-review findings are one PR comment that starts with MARKER and has one
// `path:line — summary` per line. --log upserts one row per PR in LOG_PATH.

import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export const MARKER = '<!-- claude-review -->'
export const GREPTILE_LOGIN = 'greptile-apps[bot]'
export const TOLERANCE = 3
const LOG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/agents/greptile-vs-code-review.md'
)

// `path:line — summary`, optionally bulleted or backticked; `-`, `–` or `—` before the summary.
const FINDING_LINE = /^\s*(?:[-*]\s+)?`?([^\s`:]+):(\d+)(?:-\d+)?`?\s*[—–-]\s*(.+?)\s*$/

export function parseMarkerComment(body) {
  if (!body.includes(MARKER)) return []
  return body.split('\n').flatMap((text) => {
    const m = FINDING_LINE.exec(text)
    return m ? [{path: m[1], line: Number(m[2]), summary: m[3]}] : []
  })
}

// One-to-one: closest pairs first, so a finding is never claimed by a farther neighbour.
export function matchFindings(greptile, skill, tolerance = TOLERANCE) {
  const pairs = greptile
    .flatMap((g) => skill.map((s) => ({g, s, distance: Math.abs(s.line - g.line)})))
    .filter(({g, s, distance}) => g.path === s.path && distance <= tolerance)
    .toSorted((a, b) => a.distance - b.distance)
  const paired = new Set()
  const both = []
  for (const {g, s} of pairs) {
    if (paired.has(g) || paired.has(s)) continue
    paired.add(g).add(s)
    both.push({greptile: g, skill: s})
  }
  return {
    greptileOnly: greptile.filter((g) => !paired.has(g)),
    skillOnly: skill.filter((s) => !paired.has(s)),
    both,
  }
}

// Old-side line numbers a unified-diff patch changes: deleted lines, and the line an insertion lands before.
export function changedOldLines(patch) {
  const lines = []
  let old = 0
  for (const text of patch.split('\n')) {
    const hunk = /^@@ -(\d+)/.exec(text)
    if (hunk) old = Number(hunk[1])
    else if (text.startsWith('-')) lines.push(old++)
    else if (text.startsWith('+')) lines.push(old)
    else if (!text.startsWith('\\')) old++
  }
  return lines
}

export function touchesWindow(patch, line, tolerance = TOLERANCE) {
  return changedOldLines(patch).some((l) => Math.abs(l - line) <= tolerance)
}

function ghJsonLines(path) {
  const out = execFileSync('gh', ['api', '--paginate', path, '--jq', '.[]'], {encoding: 'utf8'})
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

function ghJson(path) {
  return JSON.parse(execFileSync('gh', ['api', path], {encoding: 'utf8'}))
}

// thumbs-down wins over acted-on: a person said it was wrong even if the lines later moved.
function verdict(finding, laterCommits, filesBySha) {
  if (finding.thumbsDown) return 'thumbs-down'
  const acted = laterCommits.some((sha) =>
    filesBySha(sha).some(
      (f) => f.filename === finding.path && f.patch && touchesWindow(f.patch, finding.line)
    )
  )
  return acted ? 'acted-on' : 'ignored'
}

// Greptile opens with a P1/P2 badge image; keep its alt text, drop the markup, keep the first line.
export function greptileSummary(body) {
  const first = body.split('\n').find((l) => l.trim()) ?? ''
  return first
    .replace(/<img alt="([^"]*)"[^>]*>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 120)
}

function reviewPr(pr) {
  const greptile = ghJsonLines(`repos/{owner}/{repo}/pulls/${pr}/comments`)
    .filter((c) => c.user?.login === GREPTILE_LOGIN && !c.in_reply_to_id)
    .map((c) => ({
      path: c.path,
      line: c.line ?? c.original_line,
      summary: greptileSummary(c.body),
      createdAt: c.created_at,
      thumbsDown: (c.reactions?.['-1'] ?? 0) > 0,
    }))
  const markerComments = ghJsonLines(`repos/{owner}/{repo}/issues/${pr}/comments`).filter((c) =>
    c.body.includes(MARKER)
  )
  const skill = markerComments.flatMap((c) => parseMarkerComment(c.body))
  const result = matchFindings(greptile, skill)

  const commits = ghJsonLines(`repos/{owner}/{repo}/pulls/${pr}/commits`)
  const files = new Map()
  const filesBySha = (sha) => {
    if (!files.has(sha)) files.set(sha, ghJson(`repos/{owner}/{repo}/commits/${sha}`).files ?? [])
    return files.get(sha)
  }
  for (const g of result.greptileOnly) {
    const later = commits.filter((c) => c.commit.committer.date > g.createdAt).map((c) => c.sha)
    g.verdict = verdict(g, later, filesBySha)
  }
  const merged = ghJson(`repos/{owner}/{repo}/pulls/${pr}`).merged_at
  return {pr, merged, hasMarker: markerComments.length > 0, ...result}
}

const fmt = (f) => `  ${f.path}:${f.line}  ${f.summary}`

function print(r) {
  console.log(`PR ${r.pr}${r.hasMarker ? '' : `  (no ${MARKER} comment)`}`)
  console.log(`Greptile only (${r.greptileOnly.length}):`)
  for (const f of r.greptileOnly) console.log(`${fmt(f)}  [${f.verdict}]`)
  console.log(`Skill only (${r.skillOnly.length}):`)
  for (const f of r.skillOnly) console.log(fmt(f))
  console.log(`Both (${r.both.length}):`)
  for (const {greptile, skill} of r.both)
    console.log(`${fmt(greptile)}  ~ ${skill.path}:${skill.line}`)
  console.log('')
}

export function logRow(r) {
  const count = (v) => r.greptileOnly.filter((f) => f.verdict === v).length
  return `| ${r.pr} | ${r.merged?.slice(0, 10) ?? 'open'} | ${r.greptileOnly.length} | ${r.skillOnly.length} | ${r.both.length} | ${count('acted-on')} | ${count('ignored')} | ${count('thumbs-down')} |`
}

// Replaces the PR's row if present, else appends it; the table ends the file.
export function upsertRow(log, row) {
  const pr = row.split('|')[1].trim()
  const lines = log.trimEnd().split('\n')
  const at = lines.findIndex((l) => l.split('|')[1]?.trim() === pr)
  if (at === -1) lines.push(row)
  else lines[at] = row
  return `${lines.join('\n')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const prs = args.filter((a) => /^\d+$/.test(a))
  if (prs.length === 0) {
    console.error('usage: node scripts/ci/review-diff.mjs <pr> [<pr> ...] [--log]')
    process.exit(1)
  }
  let log = args.includes('--log') ? readFileSync(LOG_PATH, 'utf8') : undefined
  for (const pr of prs) {
    const r = reviewPr(pr)
    print(r)
    if (log !== undefined) log = upsertRow(log, logRow(r))
  }
  if (log !== undefined) {
    writeFileSync(LOG_PATH, log)
    // the gate checks markdown formatting, so realign the table now
    execFileSync('pnpm', ['exec', 'oxfmt', LOG_PATH], {stdio: 'inherit'})
  }
}
