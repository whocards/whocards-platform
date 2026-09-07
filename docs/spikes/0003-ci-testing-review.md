# CI + testing review — speed, remote mobile e2e, Greptile

**Status:** review + research complete. Written 2026-09-06. Done 2026-09-07 (PR #271): Greptile reactivated + `greptile.json`, Dependabot, force-push blocked + linear history on main, Playwright in CI, audit moved to weekly, `paths-ignore` dropped, turbo remote cache, `mobile-gate.yml` renamed to `ci.yml`. Tickets: #273 remote mobile e2e, #274 Greptile measurement.
**Feeds:** epic #230 (CI & codebase health). Pricing figures were checked against vendor pages on 2026-09-06 and will drift.

## TL;DR

The PR gate is already fast: about 1 minute of real work, 3.5 minutes median wall-clock only because the report-only `pnpm audit` job runs alongside it. There is no big CI speed problem to solve. The real gaps are elsewhere:

1. **Greptile has not reviewed a PR since 2026-07-01.** The trial ended; it has since posted "trial has ended" notices on 54 PRs. Either reactivate it on the free Starter tier with a `greptile.json` gate, or uninstall it. Measuring it against `/code-review` is impossible until it runs again.
2. **Playwright never runs in CI.** Seven website e2e spec files (static + SSR) exist and only run when someone remembers to run them locally. The Netlify deploy preview is the only website check on a PR.
3. **Mobile e2e depends on one machine.** The 11 Maestro flows run only on stark-tower as the release gate. Android can move to free `ubuntu-latest` today; iOS needs macOS somewhere, and a pay-per-minute GitHub macOS runner is the cheapest option without a second Mac.
4. **No dependency automation.** No Dependabot or Renovate config, so the audit job reports the same 24 transitive highs on every PR and nobody acts on them.

## Current state

### Workflows

| Workflow               | Trigger                                | Jobs                                                                     | Notes                                                                                           |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `mobile-gate.yml`      | PR + push to main, `paths-ignore` docs | `gate` (format, lint, `turbo run typecheck test`), `audit` (report-only) | Required check on main via ruleset. Despite the name it gates every workspace, not just mobile. |
| `mobile-release.yml`   | `v*` tag                               | gate → EAS build → submit → OTA                                          | Guarded by `EAS_RELEASE_ENABLED` repo variable.                                                 |
| Netlify deploy preview | PR                                     | website build                                                            | Required check on main.                                                                         |

Ruleset on main: block deletion, required checks `Quality gate` and `netlify/whocards-calmly/deploy-preview`, strict (branch must be up to date). No required reviews, no force-push block, no linear history (force-push block + linear history added 2026-09-07).

### Timings, last 25 successful gate runs

| Step                              | Median  | p90     | Max   |
| --------------------------------- | ------- | ------- | ----- |
| Setup pnpm                        | 5s      | 13s     | 426s  |
| Install dependencies              | 17s     | 24s     | 26s   |
| Format + lint                     | ~6s     |         |       |
| Typecheck + unit tests            | 19s     | 41s     | 44s   |
| Audit job (parallel, report-only) | ~160s   |         |       |
| Whole run wall-clock              | 3.5 min | 4.7 min | 8 min |

Turbo cache works as intended: 16 of 18 tasks hit on every run, and the 2 misses are always the package the commit actually touched. The `actions/cache` restore-keys fallback picks the _newest_ saved cache rather than the most relevant one, so with several PRs in flight a push to main sometimes misses tasks that a sibling PR already ran. A content-addressed remote cache fixes that; see below.

The 426s `Setup pnpm` outlier (twice in 40 runs) is `pnpm/action-setup` downloading pnpm on a slow mirror. Pinning `version:` in the action and letting it read `packageManager` does not help; it is a network hiccup, not config.

### Test inventory

| Workspace                    | Runner                   | Test files | Source files | Runs in CI               |
| ---------------------------- | ------------------------ | ---------- | ------------ | ------------------------ |
| apps/mobile                  | jest-expo                | 30         | 43           | yes (unit)               |
| apps/mobile `.maestro/`      | Maestro                  | 11 flows   |              | **no**, stark-tower only |
| apps/website                 | vitest (PGlite)          | 32         | 136          | yes                      |
| apps/website `tests/e2e`     | Playwright, static build | 4 specs    |              | **no**                   |
| apps/website `tests/e2e-ssr` | Playwright, `astro dev`  | 3 specs    |              | **no**                   |
| apps/app                     | vitest                   | 6          | 39           | yes                      |
| apps/emails                  | vitest                   | 8          | 18           | yes                      |
| packages/*                   | vitest                   | 10         | 30           | yes                      |

Slowest unit tests are mobile RN component tests: `share-modal` 14s, `settings-modal` 11s, `question-overflow` 6s. Together they are most of the 19s typecheck+test step. They only run when mobile changes, so this is not on the critical path for website PRs.

Pre-commit: lint-staged runs oxlint + oxfmt + prettier-for-astro. No pre-push hook, so typecheck and tests only run in CI. That is the right trade for a solo dev with a 1-minute gate.

### Greptile history

| Period                   | What Greptile posted                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-24 to 2026-07-01 | 25 substantive inline comments across 13 PRs (P1/P2 badges). Real catches: emulator leak on boot timeout, `adb wait-for-device` hanging forever, unanchored version regex, AASA `paths` deprecation, missing `rel=noopener`, no timeout on Turnstile verify. |
| 2026-07-05               | "50-credit limit for trial accounts" on 5 PRs                                                                                                                                                                                                                |
| 2026-07-28 to 2026-09-04 | "Your trial has ended" on 54 PRs, 110 notices total, up to 4 per PR                                                                                                                                                                                          |

The substantive comments were mostly P2 hygiene, but the P1s on the release script were real bugs. The quality was decent. The cost is zero on Starter (1 dev, 50 credits/month, 1 credit per review).

## Findings, ranked

1. **Greptile is dead weight right now.** 110 spam reviews, zero signal for two months. Decide: reactivate on Starter with a gate, or uninstall the app. Do not leave it as is.
2. **Playwright is unprotected.** The SSR suite covers `/play` and the tRPC API, which is the surface the mobile app depends on. A regression there ships to production with a green gate. Cheapest fix: add a `website-e2e` job to the gate that runs only when `apps/website/**` or `packages/api/**` changed, with `--shard` unnecessary at 7 specs. Budget: ~2 minutes cold (build + browser install cached).
3. **Audit job is noise.** It runs 160s on every PR, reports the same 24 transitive highs, and nobody reads it. Move it to a weekly `schedule` trigger and open an issue when the count changes. Add Dependabot with grouped updates so the backlog actually burns down (#235).
4. **Gate name and scope are misleading.** `mobile-gate.yml` gates the whole repo. Rename to `ci.yml` when next touched; agents reading the workflow name will otherwise assume website has no gate.
5. **`paths-ignore` on a required check is a latent trap.** A docs-only PR skips the workflow, and GitHub leaves the required `Quality gate` check as "expected" forever. It has not bitten yet because every PR so far touched code, or was merged by an admin. Fix: drop `paths-ignore` and instead short-circuit inside the job with `dorny/paths-filter`, or add a no-op job that reports the same check name.
6. **Ruleset is thin.** _(Done 2026-09-07.)_ No force-push block on main. Add `non_fast_forward` and `required_linear_history` rules; both are free and stop an agent from rewriting main.
7. **Standalone pnpm 11 cannot run on Intel Macs.** `@pnpm/macos-x64` was never published past 11.0.4, so the self-managing `@pnpm/exe` shim fails with `ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE` for the pinned 11.4.0. Fixed on jarvis by installing the pure-JS `pnpm@11.4.0` via npm; CI on ubuntu is unaffected. If stark-tower is Intel too, it needs the same fix.

## Recommendations

### A. CI speed, in priority order

Nothing here is urgent; the gate is already about a minute of work. Do these when touching the workflow anyway.

1. **Vercel remote cache, free tier.** Content-addressed, so the "newest cache wins" restore-keys problem goes away and local runs on stark-tower can hit the CI cache. Free on Hobby with no Vercel hosting required, fair-use capped at ~100GB/month uploads. Requires `TURBO_TOKEN` and `TURBO_TEAM` secrets. Five minutes of setup. Keep the `actions/cache` step as fallback for a week, then delete it.
2. **`turbo run typecheck test --affected`.** Skips unchanged packages entirely instead of replaying their cached logs. Saves little today (replay is fast) but pays off once Playwright joins the gate. Needs `fetch-depth: 0` on checkout or the `origin/main...HEAD` range does not resolve.
3. **Do not split into parallel jobs.** Install is 17s and the work is 25s; a second job would spend more on setup than it saves.
4. **Do not add a merge queue.** Solves PR contention, which a solo repo does not have.
5. Keep `concurrency: cancel-in-progress: true` on the PR workflow; never add it to the release workflow.

### B. Remote iOS + Android e2e without a second Mac

Pricing seen 2026-09-06.

| Option                                                      | iOS         | Android              | Cost                                                          | Verdict                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------- | -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reactivecircus/android-emulator-runner` on `ubuntu-latest` | no          | yes, KVM-accelerated | free within existing minutes                                  | **Do this first.** Build the release APK on EAS (free tier: 15 Android builds/month) or `expo prebuild` + gradle in-job, boot the emulator, run the free Maestro CLI.                                                                                                          |
| GitHub-hosted macOS runner                                  | yes         | yes                  | ~$0.06 to 0.08 per minute, 10x Linux multiplier               | **Cheapest iOS path.** Public repo means Linux minutes are free but macOS still bills. A 15-minute iOS run a few times a month is a few dollars. Seed with an EAS simulator build so the runner only boots and tests.                                                          |
| Self-hosted runner on stark-tower via Tailscale             | yes         | yes                  | free                                                          | Viable, but the repo is **public**. GitHub says self-hosted runners should almost never be used on public repos because any fork PR can run code on the machine. Only acceptable if the workflow is `workflow_dispatch` or `push` to protected branches, never `pull_request`. |
| EAS Workflows `maestro` job                                 | yes         | yes                  | EAS build fee + CI minutes **+ a Maestro Cloud subscription** | The job type submits to Maestro Cloud; it does not avoid the $250 per device per month. Skip.                                                                                                                                                                                  |
| Maestro Cloud                                               | yes         | yes                  | $250 per device per month                                     | Priced for teams. Skip.                                                                                                                                                                                                                                                        |
| BrowserStack, Sauce Labs                                    | yes         | yes                  | $129 to 249 per month                                         | Skip.                                                                                                                                                                                                                                                                          |
| Firebase Test Lab                                           | XCTest only | yes                  | free daily quota                                              | Not built for Maestro. Skip.                                                                                                                                                                                                                                                   |

Ranked plan:

1. **Android in CI now.** New `mobile-e2e-android` job on `ubuntu-latest`, triggered on `workflow_dispatch` and on PRs that touch `apps/mobile/**` or `packages/decks/**`. Cache the AVD snapshot as the action README shows; cold boot is ~3 minutes, warm is under 1. This makes half the release gate remote and free.
2. **iOS on a GitHub macOS runner, manual trigger.** `workflow_dispatch` only, so it runs when a release is being cut, not per PR. Use an EAS `simulator: true` build profile so the runner downloads a tarball instead of compiling. Expect 10 to 15 minutes per run.
3. **Then relax the release gate.** `pre-release-check.mjs` can accept a "CI passed for this sha" marker from those two jobs instead of insisting on local simulators. Keep the local path as the fallback.
4. **Skip the stark-tower self-hosted runner** unless the repo goes private. The device-loop skill already covers "I'm at the machine and want fast iteration."

### C. Greptile: gate it, then measure it

**Step 1, decide.** Starter is free for one developer with 50 credits a month. Recent history is about 30 PRs a month, so a gate is needed to stay under 50 and to keep it off trivial PRs. If the decision is to drop it, uninstall the GitHub App so it stops posting.

**Step 2, gate with `greptile.json` at repo root.** Fields confirmed from Greptile's docs (archived snapshot, re-verify in the dashboard):

```json
{
  "triggerOnDrafts": false,
  "triggerOnUpdates": false,
  "disabledLabels": ["skip-greptile", "dependencies", "documentation"],
  "excludeAuthors": ["dependabot[bot]"],
  "ignorePatterns": "**/*.md\ndocs/**\npnpm-lock.yaml\n**/*.snap\n**/CHANGELOG.md",
  "strictness": 2
}
```

"Meaningful" heuristic to apply by label rather than line count: anything that touches `apps/mobile/src`, `packages/api`, `apps/website/src/server`, or `scripts/release`. Line-count gates get fooled by lockfiles; path gates do not. If per-PR opt-in is preferred, use `"labels": ["needs-review"]` instead, which the triager already applies.

**Step 3, measure against `/code-review`.** Greptile's dashboard shows an "addressed rate" and upvotes per comment, but no confirmed API. Use GitHub's data instead:

- Have `/code-review` post its findings as one PR comment with a `<!-- claude-review -->` marker and a `file:line` per finding. The babysit skill already runs reviewers per PR, so this is one template change.
- A script, run monthly or on merge, pulls `pulls/{n}/comments` filtered to `greptile-apps[bot]`, and diffs `path:line` (with a small line tolerance) against the Claude marker comment. Output per PR: Greptile-only, Claude-only, both.
- Track two numbers in a `docs/growth`-style log: Greptile-only findings that were acted on (a follow-up commit touched that line), and false positives (thumbs-down or ignored). After ~20 gated PRs, decide whether it earns its place.

The 25 historical Greptile comments from June are a free baseline: re-run `/code-review` on those 13 PRs and see how many of the P1s it also catches.

## What to do next, in order

1. Greptile: reactivate on Starter + `greptile.json`, or uninstall. Ten minutes either way.
2. Add Dependabot (grouped, weekly) and move `audit` to a weekly schedule.
3. Add the Playwright job to the gate, path-filtered to website + api changes.
4. Add the Android emulator e2e job, path-filtered to mobile + decks.
5. Vercel remote cache + `--affected`.
6. iOS macOS-runner job on `workflow_dispatch`, then teach `pre-release-check.mjs` to trust it.
7. Ruleset: block force-push and require linear history. _(Done 2026-09-07.)_

## Sources

- Turborepo GitHub Actions guide: https://turborepo.dev/docs/guides/ci-vendors/github-actions
- Turborepo remote cache free tier: https://vercel.com/changelog/free-vercel-remote-cache
- Turborepo `--affected` / filter syntax: https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/filtering/RULE.md
- GitHub required checks + skipped workflows: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks
- GitHub Actions billing and macOS multiplier: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
- KVM Android emulation on hosted runners: https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/
- `reactivecircus/android-emulator-runner`: https://github.com/ReactiveCircus/android-emulator-runner
- Self-hosted runner security: https://docs.github.com/en/actions/reference/security/secure-use
- Tailscale + GitHub runners: https://tailscale.com/kb/1586/secure-github-runners
- Maestro Cloud pricing: https://maestro.dev/pricing
- EAS pricing: https://expo.dev/pricing ; EAS Workflows e2e example: https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- Firebase Test Lab quotas: https://firebase.google.com/docs/test-lab/usage-quotas-pricing
- Greptile pricing: https://www.greptile.com/pricing ; `greptile.json` (archived): http://web.archive.org/web/20260609230026/https://www.greptile.com/docs/code-review-bot/greptile-json ; analytics (archived): http://web.archive.org/web/20260804174955/https://www.greptile.com/docs/analytics
