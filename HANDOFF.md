# Handoff — ticket 0004 (logger package) READY TO BUILD via coder/reviewer subagents

Branch **`main`** at `/Users/avi/code/whocards/app`, clean at `b40dfd6`. The unified-play +
Answer-record work and the monorepo DB-migration takeover are **done, merged, and applied to
prod**. This session scoped the next no-input task — **ticket 0004, the `@whocards/logger`
package** — down to a complete, deterministic implementation brief (below). It was **not yet
coded**: the user wants all coding done by the project **`coder` subagent**, then reviewed by the
**`reviewer` subagent**, and merged only if review passes — but those custom agents only register
at **session start**, so the user is restarting. **After restart, hand the brief in
§"READY-TO-EXECUTE" straight to the `coder` subagent.**

## Goal

One unified play experience across web (`apps/website`, Astro) + mobile (`apps/mobile`, Expo) on
the shared engine, with a **permanent Answer record**. Immediate goal: ship ticket 0004 — a tiny
shared logging seam (`console` in dev, injected PostHog sink in prod) replacing the raw
`console.warn`s the Answer queues introduced.

## Workflow the user wants (IMPORTANT — applies from restart on)

- **All coding via the `coder` subagent** (`.claude/agents/coder.md`), then **review via the
  `reviewer` subagent** (`.claude/agents/reviewer.md`); **merge only if review passes.** Do not
  write the code yourself — orchestrate the agents.
- These custom agents load **only at session start** — that's why a restart was needed. After
  restart they should be available as `subagent_type: "coder"` / `"reviewer"`.
- **Repo has NO git remote** (`git remote -v` is empty). `gh` is authed as `acharlop`, but the
  tickets are local markdown in `docs/tickets/`, **not** GitHub issues. So the coder/reviewer
  agent defs (written for a `gh` PR flow) must be **adapted to local-only**: coder works on a
  **local branch** and commits — **no push, no `gh`, no PR, no self-merge**; reviewer reviews
  `git diff main...HEAD`; the **orchestrator merges to `main`** after review passes + `pnpm check`
  is green. Tell each subagent this in its prompt.

## Current Progress (DONE — on `main`)

- **Answer record (0003)** — merged. `answer` table; `answers.record` tRPC mutation via a
  port/adapter; per-Device anonymous id; offline queues (web `apps/website/src/lib/offline-queue.ts`,
  mobile `apps/mobile/src/lib/answer-queue.ts`); record-on-serve in both clients. Engine pure.
- **DB baseline / takeover (0005)** — merged, **applied to Supabase prod**. 16 prod tables modeled;
  idempotent `0000_full_baseline.sql`; verified 16→17 tables, nothing dropped. NB: the bigint
  `maxValue` / `ts80008` trap mentioned in older handoffs is **already resolved** — there is **no
  `maxValue` left in `schema.ts`**; drop that from any follow-up list.
- **Project agents** in `.claude/agents/` (architect, coder, researcher, reviewer).
- **Tickets** (`docs/tickets/`): `0001` CJK fonts (open), `0002` Convex (parked), `0003` ✅,
  `0004` logging (open — **this handoff**), `0005` ✅ baseline / auth-cleanup pending,
  `0006` deployed-vs-repo visual-parity suite for cutover (open).

## READY-TO-EXECUTE — ticket 0004 coder brief (hand this to the `coder` subagent)

Implement the **SHARED package + WEB wiring + MOBILE console→logger swap**. **Do NOT add
`posthog-react-native`** or any native dep, and do NOT build the mobile PostHog transport — that's
deferred (needs a device rebuild). Mobile runs console-in-dev / no-op-in-prod for now (ticket
allows it). Full ticket: `docs/tickets/0004-logging-wrapper-posthog.md`.

**Conventions:** packages are consumed as **TS source** via `exports` (no build) — copy
`packages/decks/{package.json,tsconfig.json}`. Packages + mobile = **oxlint + oxfmt**; relevant
rules: `no-console: error` (off in `*.test.ts`), `import/no-default-export: error`,
`consistent-type-definitions: ["error","type"]` (use `type`, never `interface`),
`consistent-type-imports`. **`apps/website/**`is EXCLUDED from both oxlint and oxfmt** (confirmed
in`.oxlintrc.json`+`.oxfmtrc.json` `ignorePatterns`) — it uses **prettier**
(`semi:false, singleQuote:true, printWidth:100, tabWidth:2, arrowParens:always, bracketSpacing:false,
trailingComma:es5`) + `astro check`. Catalog deps: `"typescript": "catalog:"`, `"vitest": "catalog:"`.

**Step 1 — branch:** `git checkout -b feat/0004-logger` off clean `main`.

**Step 2 — create `packages/logger`:**

- `package.json`: name `@whocards/logger`, `private`, `type:module`, `exports {".":"./src/index.ts"}`,
  scripts `typecheck: "tsc --noEmit"` + `test: "vitest run"`, devDeps
  `@whocards/typescript-config: workspace:*`, `typescript: catalog:`, `vitest: catalog:`.
- `tsconfig.json`: mirror `packages/decks/tsconfig.json` (extends `@whocards/typescript-config/base.json`,
  `noEmit:true`, include `src`).
- `src/index.ts`: named exports only. Types (use `type`): `LogLevel = 'warn'|'error'`;
  `LogContext = Record<string, unknown>` (PII-safe: ids + messages only); `LogEntry = {level,
message, error?: Error, context?: LogContext}`; `LogSink = (entry: LogEntry) => void`;
  `LoggerConfig = {dev: boolean, sink?: LogSink}`. Module-state `let config: LoggerConfig = {dev:true}`
  (safe default = console). `configureLogger(next)` sets it. `toError(unknown): Error|undefined`
  (undefined/null→undefined; Error→as-is; else `new Error(String(value))`). A `toConsole(entry)`
  helper wrapped in an **oxlint-disable block for `no-console`** (the dev transport is console by
  design — verify the directive passes `oxlint --deny-warnings`; `/* oxlint-disable no-console */`
  … `/* oxlint-enable no-console */`, else per-line `// eslint-disable-next-line no-console` which
  oxlint also honors). `emit(level,message,error?,context?)` builds the entry **without assigning
  `undefined`** to optional fields (safe under `exactOptionalPropertyTypes` — check
  `tooling/typescript-config/base.json`), routes: `config.dev → toConsole`; else
  `config.sink → config.sink(entry)`; else **no-op**; whole body wrapped in `try { } catch {}` so
  logging **never throws**. Exports `logWarn(message,error?,context?)` and `logError(...)`.
- `src/logger.test.ts` (vitest, node env, default — no config file needed): cover dev→console,
  prod+sink→sink (and NOT console), prod+no-sink→no-op, never-throws-when-sink-throws, non-Error
  value normalised to Error. `afterEach`: `vi.restoreAllMocks()` + `configureLogger({dev:true})`.
  Spy via `vi.spyOn(console,'warn'|'error').mockImplementation(()=>{})`. Use optional chaining on
  `entry.error` in assertions (exactOptional-safe).

**Step 3 — WEB wiring (`apps/website`, prettier style):**

- Add `"@whocards/logger": "workspace:*"` to `apps/website/package.json` deps (alpha w/ other `@whocards/*`).
- New `apps/website/src/lib/logger.ts` → `initWebLogger()` calling `configureLogger({dev:
import.meta.env.DEV, sink})`. Sink uses `window.posthog` (typed `import('posthog-js').PostHog` in
  `apps/website/src/env.d.ts`): if `entry.error` →
  `window.posthog?.captureException(entry.error, {message, level, ...context})`; else
  `window.posthog?.capture('$exception_log', {message, level, ...context})`; if no `window.posthog`,
  do nothing. (posthog-js `^1.376.4` has `captureException`.)
- Call `initWebLogger()` **unconditionally** at the end of the `<script>` in
  `apps/website/src/components/PostHog.astro` (so dev→console works even without a PostHog key).
  PostHog.astro is mounted in the main `apps/website/src/layouts/Layout.astro`. Website alias is `~lib/...`.
- In `apps/website/src/lib/offline-queue.ts` replace the two `console.warn`s: the "dropping Answer
  after repeated failures" → `logError('[answer-queue] dropping Answer after repeated failures',
error, {attempts: head._attempts + 1})`; the "flush failed; keeping backlog" →
  `logWarn('[answer-queue] flush failed; keeping backlog', error)`. Add
  `import {logError, logWarn} from '@whocards/logger'`. Match the file's no-semicolon style.

**Step 4 — MOBILE swap (`apps/mobile`, oxlint+oxfmt) — NO native dep:**

- Add `"@whocards/logger": "workspace:*"` to `apps/mobile/package.json` deps (alpha w/ other `@whocards/*`).
- `apps/mobile/src/lib/answer-queue.ts`: replace the `console.warn('[answer-queue] flush failed;
keeping backlog', error)` with `logWarn(...)`, **remove the `// eslint-disable-next-line
no-console …` comment**, add `import {logWarn} from '@whocards/logger'`.
- `apps/mobile/src/app/_layout.tsx`: import `{configureLogger}` and call
  `configureLogger({dev: __DEV__})` at module scope (no sink → console-in-dev / no-op-in-prod).
  `__DEV__` is an RN global; only add a decl if `pnpm -F mobile typecheck` complains.

**Step 5 — install + verify (fix anything broken):** `pnpm install`; `pnpm -F @whocards/logger test`

- `typecheck`; `pnpm check` (`oxfmt --check && oxlint --deny-warnings && turbo typecheck test`);
  `pnpm -F website exec astro check` — **capture the ~13 PRE-EXISTING errors on `main` first** and
  prove **zero new** ones; `pnpm -F mobile typecheck`.

**Step 6 — commit (NO push/PR/merge):** on `feat/0004-logger`, e.g.
`feat(logger): add @whocards/logger; wire web sink + mobile console swap (0004)`. Body: shared
package routing, web `captureException` + offline-queue swap, mobile console→logWarn + dropped
disable, mobile PostHog transport deferred. **Report:** branch, files changed, each verification
command's result, astro-check new-vs-baseline counts, deviations. **Don't merge.**

Then: **reviewer subagent** on `git diff main...HEAD` → if it approves and `pnpm check` is green,
**orchestrator merges to `main`** (local fast-forward/merge; no remote to push).

## Other no-input work considered (NOT chosen — context for later)

- **Pool-data dedup** (point website at `@whocards/decks` instead of local
  `apps/website/src/data/{questions,languages}.json`): the JSON pairs are **byte-identical**
  (verified by sha) so the _runtime_ is zero-risk, BUT it is **not** purely mechanical — the
  website derives **literal-union types** (`keyof typeof questions`, `keyof typeof languages` in
  `apps/website/src/types/index.ts`, used by `WhoCard.astro`, `card-image.ts`, `language.ts`,
  `gameplay.ts`, `pages/.../images.astro`), while `@whocards/decks` types broadly (`LanguageCode =
string`, `QuestionId = string`, `Pool = Record<string, …>`). Consuming decks' value exports would
  **widen** the website's types and weaken its compile-time safety — that's a **design decision**
  (accept widening vs. preserve literals via a JSON re-export), so flag it for the user rather than
  doing it as "no-input" work.
- **Auth cleanup (0005 #1)** — blocked: needs the user's auth decision (`auth_*` vs `account_*` vs
  drop) AND explicit authorization to touch prod.
- **CJK fonts (0001)**, **mobile device verification** — need the user / a device.

## Key facts the next agent needs

- **Prod DB = Supabase** (eu-central-1 pooler, 6543). Connecting needs EXPLICIT user authorization
  naming the target (safety classifier). Creds in `website-next-15/.env.prod` as `DATABASE_URL`;
  `apps/website` reads `DB_URL`.
- Lint/format = **oxlint + oxfmt** (never eslint/prettier) for packages + mobile; **website excluded
  from both** (prettier + `astro check`). `no-console: error` only bites packages/mobile.
- `window.posthog?: import('posthog-js').PostHog` is declared in `apps/website/src/env.d.ts`;
  `Play.tsx` already uses `window.posthog?.capture(...)`. PostHog inits in `PostHog.astro` (in `Layout.astro`).
- Never commit `.env*`, real order data, or secrets. Mobile native deps need a dev-client rebuild.

## What Worked

- Scoping a ticket to an exact, file-by-file brief (with conventions + verification) before any
  agent touches code — minimizes a cold-start subagent's re-exploration.
- Grounding "no-input" claims in the actual code: sha-comparing the duplicate JSON, grepping
  literal-type derivations, confirming lint/format ignore patterns — surfaced that the dedup is a
  design decision, not free work.

## What Didn't Work / Gotchas

- **Custom `.claude/agents/*.md` register only at session start** — can't be used as `subagent_type`
  mid-session. (This session tried to spawn a `general-purpose` agent carrying the coder
  instructions as a workaround; the user preferred to restart and use the real `coder` agent.)
- **No git remote** — the coder/reviewer agent defs assume `gh`/PRs; adapt to local branch + merge.
- The bigint `maxValue`/`ts80008` warning from older handoffs is **already gone** — don't chase it.

## Next Steps (ordered)

1. **Ship ticket 0004** via the workflow above: `coder` subagent (the §READY-TO-EXECUTE brief) →
   `reviewer` subagent → `pnpm check` green → orchestrator merges to `main`. Then mark 0004's
   shared+web done and note the mobile **PostHog transport** (`posthog-react-native` + provider) as
   the deferred remainder (needs a dev-client rebuild = user/device).
2. **Auth decision → cleanup migrations (0005).** Needs user's auth choice + prod authorization.
3. **CJK question fonts (0001)** — mobile; needs user's subset/bundle/system choice.
4. **Pool-data dedup** — surface the type-widening tradeoff (above) to the user first.
5. **Mobile device verification** — run Answer-record + offline flush on a rebuilt dev client.

## Pre-existing follow-ups (still open, unrelated)

- Web tokens: regenerate `base.css @theme` from `@whocards/tokens`. Website type debt (~13 pre-existing
  `astro check` errors; fold site into oxlint/oxfmt after). tRPC ETag. `website-next-15` retirement
  (**parked** — holds prod creds + dump).

## Run it

```bash
pnpm install
pnpm -F website dev      # needs apps/website/.env for full run (placeholders ok for build)
pnpm -F mobile start     # Expo
pnpm check               # oxfmt --check && oxlint --deny-warnings && turbo typecheck test
```
