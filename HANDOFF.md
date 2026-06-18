# Handoff — 0004 (logger) + 0006 (visual-parity v1+v2) SHIPPED; remaining work mostly user-gated

Branch **`main`** at `/Users/avi/code/whocards/app`, clean at **`d4a6aaf`**. Done & merged: the
unified-play + Answer-record work (0003), the monorepo DB-migration takeover (0005 baseline), the
**`@whocards/logger`** package (0004 — shared + web + mobile-console-swap), and the **visual-parity
suite** (0006 — v1 static routes + v2 SSR/play). All shipped via the `coder` → `reviewer` →
orchestrator-merge workflow. The parity run was executed against the live site and
**the repo is at-or-ahead of the deployed site** (see the 0006 progress note). Remaining open work
now needs a user decision or a device — see Next Steps.

## Goal

One unified play experience across web (`apps/website`, Astro) + mobile (`apps/mobile`, Expo) on
the shared engine, with a **permanent Answer record**, observable failures, and a de-risked cutover
from the currently-deployed site to this repo.

## Workflow the user wants (IMPORTANT — applies to every ticket)

- **All coding via the `coder` subagent** (`.claude/agents/coder.md`), then **review via the
  `reviewer` subagent** (`.claude/agents/reviewer.md`); **merge only if review passes.** Do not
  write feature code yourself — orchestrate the agents.
- These custom agents load **only at session start** — if they aren't available as
  `subagent_type: "coder"` / `"reviewer"`, restart before starting ticket work.
- **Repo has NO git remote** (`git remote -v` is empty); tickets are local markdown in
  `docs/tickets/`, **not** GitHub issues. So the coder/reviewer flow is **local-only**: coder works
  on a **local branch** and commits — **no push, no `gh`, no PR, no self-merge**; reviewer reviews
  `git diff main...HEAD`; the **orchestrator merges to `main`** (local fast-forward) after review
  passes + `pnpm check` is green-modulo-the-known-website-type-debt. **Tell each subagent this in
  its prompt** (their defs assume a `gh`/PR flow).
- **`SendMessage` is not available in this environment** — you cannot resume a finished subagent's
  context. For follow-up fixes, spawn a **fresh** `coder` with precise, file-specific instructions.

## Current Progress (DONE — on `main`)

- **Visual-parity suite (0006)** — v1 `38df274`, v2 `d4a6aaf`. Screenshots each route on the deployed
  site (`DEPLOYED_URL`, default `https://whocards.cc`) vs a local build and pixel-diffs into an HTML
  report — a cutover **triage tool**, not a CI gate. **v1** (`test:parity`): static routes via
  `tests/static-server.mjs`. **v2** (`test:parity:ssr`): SSR/play routes via `astro dev`, with
  deterministic `?lang=&q=` deep links (`Play.tsx` honours `?q=` → no shuffle); shared capture/diff in
  `tests/parity/_capture.ts`; dev toolbar disabled via `astro.config devToolbar` (gated on
  `DISABLE_DEV_TOOLBAR`). Stabilises by blocking PostHog/consent, freezing CSS motion, masking the
  GSAP `.rotate` hero. **Run findings vs the live site:** marketing already matches (5 routes
  pixel-perfect; `/` + `/images` diffs were image-capture artifacts — **no images were deleted in the
  migration**, byte-identical to the old `website` repo); **`ai-at-work` the repo is AHEAD** (deployed
  still shows `TODO(copy)` placeholders); SSR/play **10/10 <2%**. **Still deferred:** `/purchase` +
  `/thanks` (Stripe state), `/events/hajnalig/play` (shuffle masking), and hardening v1's lazy-image
  capture.
- **Logger (0004)** — merged **`f3ec037`**. `@whocards/logger` (TS-source package, no build):
  `logWarn`/`logError`, dev→`console` / prod→injected `LogSink`, `try/catch` so it never throws,
  PII-safe (`Record<string, unknown>` — ids + messages only). **Web** wires a sink to
  `window.posthog?.captureException` (with Error) / `capture('app_log', …)` (no Error) at
  `PostHog.astro` init, and swapped the two `offline-queue.ts` `console.warn`s to
  `logError`/`logWarn`. **Mobile** swapped `answer-queue.ts` `console.warn`→`logWarn` (dropped the
  `eslint-disable no-console`) and calls `configureLogger({dev: __DEV__})` at app root
  (console-in-dev / no-op-in-prod). **Deferred remainder:** the mobile PostHog **transport**
  (`posthog-react-native` + provider + real sink) — needs a dev-client rebuild = user/device.
  NB: the event name was `$exception_log` in the original brief; the **user chose `app_log`** (avoid
  PostHog's reserved `$` prefix).
- **Answer record (0003)** — merged. `answer` table; `answers.record` tRPC mutation via a
  port/adapter; per-Device anonymous id; offline queues (web `apps/website/src/lib/offline-queue.ts`,
  mobile `apps/mobile/src/lib/answer-queue.ts`); record-on-serve in both clients. Engine pure.
- **DB baseline / takeover (0005)** — merged, **applied to Supabase prod**. 16 prod tables modeled;
  idempotent `0000_full_baseline.sql`; verified 16→17 tables, nothing dropped. (The old bigint
  `maxValue`/`ts80008` trap is resolved — there is **no `maxValue` left in `schema.ts`**.)
- **Project agents** in `.claude/agents/` (architect, coder, researcher, reviewer).
- **Tickets** (`docs/tickets/`): `0001` CJK fonts (open), `0002` Convex (parked), `0003` ✅,
  `0004` ✅ shared+web+mobile-console (mobile PostHog transport deferred), `0005` ✅ baseline /
  auth-cleanup pending, `0006` ✅ visual-parity v1+v2 (few routes deferred: Stripe state / shuffle).

## Next Steps (ordered)

1. **0006 leftovers (optional polish, low priority — the meaty work is done).** `/purchase` +
   `/thanks` parity (needs real Stripe session/keys), `/events/hajnalig/play` (client shuffle — mask
   the question region or add `?q=` to the event deck), and hardening v1's lazy-image capture
   (scroll-to-load before the fullPage screenshot) so image-heavy-page numbers are trustworthy.
   Populate the README's known-acceptable-diffs table from a real run (e.g. `ai-at-work` = repo-ahead).
2. **Mobile PostHog transport (0004 remainder).** Add `posthog-react-native` + provider, inject a
   real sink. Native dep → **needs a dev-client rebuild = user/device.**
3. **Auth decision → cleanup migrations (0005).** Blocked: needs the user's auth choice
   (`auth_*` vs `account_*` vs drop) **and** explicit authorization to touch prod.
4. **CJK question fonts (0001)** — mobile; needs the user's subset/bundle/system choice.
5. **Pool-data dedup** — surface the type-widening tradeoff (below) to the user first.
6. **Mobile device verification** — run Answer-record + offline flush on a rebuilt dev client.

## Other no-input work considered (NOT chosen — context for later)

- **Pool-data dedup** (point website at `@whocards/decks` instead of local
  `apps/website/src/data/{questions,languages}.json`): the JSON pairs are **byte-identical**
  (verified by sha) so the _runtime_ is zero-risk, BUT it is **not** purely mechanical — the
  website derives **literal-union types** (`keyof typeof questions`, `keyof typeof languages` in
  `apps/website/src/types/index.ts`, used by `WhoCard.astro`, `card-image.ts`, `language.ts`,
  `gameplay.ts`, `pages/.../images.astro`), while `@whocards/decks` types broadly (`LanguageCode =
string`, `QuestionId = string`). Consuming decks' value exports would **widen** the website's
  types and weaken its compile-time safety — a **design decision** (accept widening vs. preserve
  literals via a JSON re-export), so flag it for the user rather than doing it as "no-input" work.

## Key facts the next agent needs

- **Prod DB = Supabase** (eu-central-1 pooler, 6543). Connecting needs EXPLICIT user authorization
  naming the target (safety classifier). Creds in `website-next-15/.env.prod` as `DATABASE_URL`;
  `apps/website` reads `DB_URL`.
- Lint/format = **oxlint + oxfmt** (never eslint/prettier) for packages + mobile; **website excluded
  from both** (prettier + `astro check`). `no-console: error` only bites packages/mobile.
- **`pnpm check`** = `oxfmt --check && oxlint --deny-warnings && turbo typecheck test`. It exits
  non-zero **only** on `website#typecheck`, which carries **12 PRE-EXISTING `astro check` errors**
  (measured on `main`: missing `wawoff2`/`bidi-js` decls, `Icon` types, etc.) — website type debt
  unrelated to recent work. Capture the baseline and prove **zero new** errors; everything else
  (9/10 turbo tasks) is green.
- `window.posthog?: import('posthog-js').PostHog` is declared in `apps/website/src/env.d.ts`;
  `Play.tsx` and now `src/lib/logger.ts` use `window.posthog?.capture(...)`. PostHog inits in
  `apps/website/src/components/PostHog.astro` (mounted in `apps/website/src/layouts/Layout.astro`).
- Packages are consumed as **TS source** via `exports` (no build) — copy `packages/decks` /
  `packages/logger` shape. Catalog deps: `"typescript": "catalog:"`, `"vitest": "catalog:"`.
- Never commit `.env*`, real order data, or secrets. Mobile native deps need a dev-client rebuild.

## What Worked

- Scoping a ticket to an exact, file-by-file brief (conventions + verification commands) before any
  agent touches code — the cold-start `coder` shipped 0004 in essentially one pass.
- The review gate earned its keep: the `reviewer` flagged the `$exception_log` reserved-`$` prefix
  (→ user chose `app_log`) and two nits (noisy `console` undefineds; a missing dev+error test) — all
  fixed in a small follow-up pass and amended into a single clean commit.
- Surfacing the one outward-facing, brief-contradicting decision (the PostHog event name) to the
  user via a quick question rather than silently overriding the written brief.
- For 0006, the **hermetic self-diff smoke test** (point `DEPLOYED_URL` at the local server) paid off
  twice: it runs with no network, and it **caught non-determinism** — flagged the shuffled
  `/events/hajnalig/play` at ~4% (dropped from v1). The `reviewer` then caught that the GSAP hero
  animation is immune to `animation:none` (JS/rAF-driven) → fixed by masking `.rotate`.
- The real parity run answered the cutover question directly: most pages already match, and the
  exceptions were diagnosable — `ai-at-work` is the **repo improving on** deployed (`TODO(copy)`
  placeholders still live there), and the home/`images` "missing images" were a **capture artifact**,
  not deleted assets (proven by a byte-identical old-vs-new file comparison: counts 12/12 + 37/37,
  same sizes). Checking the user's "deleted in migration" hunch against the actual files prevented a
  pointless copy.

## What Didn't Work / Gotchas

- **`SendMessage` is unavailable here** — couldn't resume the original `coder`'s context for the
  review fixes; had to spawn a fresh `coder` with precise instructions. Plan for this.
- **`pnpm check` is never fully green** because of the ~13 pre-existing website `astro check`
  errors. Don't chase them as part of an unrelated ticket; gate on "zero NEW errors" instead.
- Custom `.claude/agents/*.md` register **only at session start** — restart if `coder`/`reviewer`
  aren't selectable.
- **No git remote** — the agent defs assume `gh`/PRs; always adapt prompts to local branch + merge.
- **A `coder` subagent can die mid-run** — the 0006 coder crashed after ~13 min (`API Error:
ConnectionRefused`; safety classifier also down) with **no report**, leaving uncommitted files on
  its branch. Recovery: inspect `git status` + the branch, then run the verification the coder
  skipped and commit the output yourself — don't assume a silent/dead agent finished cleanly.

## Pre-existing follow-ups (still open, unrelated)

- Web tokens: regenerate `base.css @theme` from `@whocards/tokens`. **Website type debt** (12
  pre-existing `astro check` errors; fold the site into oxlint/oxfmt after). tRPC ETag.
  `website-next-15` retirement (**parked** — holds prod creds + dump).

## Run it

```bash
pnpm install
pnpm -F website dev      # needs apps/website/.env for full run (placeholders ok for build)
pnpm -F mobile start     # Expo
pnpm check               # oxfmt --check && oxlint --deny-warnings && turbo typecheck test
pnpm -F @whocards/logger test   # 12 tests, the logger package
DEPLOYED_URL=http://localhost:4321 pnpm -F website test:parity   # 0006 self-diff smoke (no network)
```
