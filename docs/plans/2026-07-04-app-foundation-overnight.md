# Overnight build spec — `apps/app` foundation (auth + RBAC + question-review + agent)

Date: 2026-07-04 · Branch: `feat/whocards-app-foundation` · Decision: [ADR-0008](../adr/0008-authenticated-app-on-tanstack-start.md)

**Goal (definition of done for the morning):** Avi wakes up to a **deployed Netlify preview URL** he
can **log into** (magic link) and:

1. **Review the 5 AI-at-work question variants** side by side, comment, vote, and **approve one**
   (this unblocks the PR #144 variant pick that gates the marketing launch).
2. **Invite teammates and set their roles** (admin / facilitator / reviewer).
3. **Discuss a question with an AI agent** inline (wired to the existing question-lab).

Keep `apps/website` (Astro marketing/SEO) **completely untouched**. This is a **new `apps/app`**.

## Stack (all paved-path; see ADR-0008)

- **TanStack Start v1** (Vite + Nitro) — new `apps/app`. Netlify preset for deploy.
- **better-auth** — Drizzle adapter (Postgres, reuse `DB_URL`). **Magic link via Resend**
  (`RESEND_API_KEY` already in env) + **Google provider scaffolded but disabled** until
  `GOOGLE_CLIENT_ID/SECRET` are provided (read from env; if absent, hide the Google button — never
  crash).
- **RBAC** — better-auth **admin + organization** plugins. Roles: `owner`, `admin`, `facilitator`,
  `reviewer`, `member`. Seed Avi (`avicharlop@gmail.com`) as `owner` on first login.
- **tRPC v11** (`@whocards/api`) + **@tanstack/react-query** (already in catalog) for data.
- **Reuse** `@whocards/decks` (question data) and `@whocards/tokens` (design tokens) so the app
  looks on-brand.

## New DB tables (additive migration only — never drop existing)

better-auth's own tables (user/session/account/verification/organization/member) **plus**:

- `question_review` — one row per (deck_slug, question_id) under review: status
  (`draft`/`in_review`/`approved`/`rejected`), current text snapshot, proposed edit, decided_by,
  decided_at.
- `question_comment` — threaded comments on a question (author = member, body, created_at).
- `question_vote` — one vote per (member, question) — up/down or 1–5, for ranking variants.
- `agent_message` — transcript of the "discuss with agent" thread per question (role, content).

Keep the legacy `auth_*`/`account_*` tables in place (their drop is a **separate** follow-up
migration per ADR-0008 — do not touch them tonight).

## Tracer-bullet slices (land in this order; deploy after slice 1)

1. **Scaffold + deploy skeleton (de-risk first).** `apps/app` TanStack Start hello-world with the
   Netlify preset; wire it into pnpm/turbo; get a **green Netlify preview deploy of the branch**
   before anything else. This retires the two biggest risks (new framework + deploy) up front.
2. **Auth.** better-auth + Drizzle adapter; magic-link email through Resend; Google provider
   scaffolded (env-gated). Protected route + sign-in/out. Seed Avi as `owner`.
3. **RBAC + people admin.** Roles + an `/admin/people` screen: list users, invite by email, change
   role. Route/permission guards (`facilitator+` can review; `admin+` can manage people).
4. **Question-review surface.** `/review`: load the 5 `ai-at-work*.questions.json` variants from
   `apps/website/src/data/decks/`, show side-by-side, comment, vote, **approve one**. Export/emit
   the approved variant so it can become `packages/decks/src/decks/ai-at-work.questions.json`
   (a diff/PR, keeping git as source of truth).
5. **Discussion agent.** Reuse the question-lab prompt/Anthropic path
   (`apps/website/src/server/question-lab/`) as a server function: "discuss this question with an
   agent" thread per question, persisted to `agent_message`. Gate to signed-in `facilitator+`.
   Requires `ANTHROPIC_API_KEY` in env (optional — degrade gracefully if absent).

## Guardrails

- **Never touch `apps/website` runtime.** Shared DB schema changes must be additive + migration-file
  based (`db:generate`), not `db:push` against prod.
- **No secrets in code or logs.** All from env. If a provider's env is missing, degrade (hide the
  feature), don't crash.
- **Match house style:** biome/prettier, the repo's tRPC patterns, `@whocards/tokens`. Typecheck +
  lint must pass. Add tests where the review/vote/role logic has real branches.
- **Branch CI green is the merge gate** (Avi merges). Overnight, stack commits on this branch; the
  Netlify **preview** is the deliverable — do **not** merge to main.
- If TanStack Start scaffolding or the Netlify preset fights back for more than ~1 focused pass,
  **fall back**: land slices 2–4 as an Astro `/admin` SSR area on `apps/website` instead, and leave
  a note — a loginnable review tool by morning beats a perfect-but-undeployed one. (Prefer TanStack;
  fall back only if genuinely blocked.)

## Status log (agents append here)

- 2026-07-04 — spec written; branch cut; coder agent dispatched on slice 1.
- 2026-07-04 (night) — **Slice 1 DONE.** `apps/app` scaffolded on TanStack Start v1
  (`@tanstack/react-start` 1.168.27, Vite 8.1.3, Nitro, `@netlify/vite-plugin-tanstack-start`
  1.3.16), wired into the pnpm workspace (no `pnpm-workspace.yaml`/`turbo.json` changes
  needed — both already glob `apps/*` and key off each package's own scripts). New
  dedicated Netlify site `whocards-app` created (account `acharlop`, project id
  `4946623e-cbfd-40d3-907a-d203ee267053`) — apps/website's `whocards-calmly` site
  untouched/unmodified in content or deploy. Deployed and verified live:
  **https://whocards-app.netlify.app** (HTTP 200, real SSR HTML). Deploy recipe that
  actually works, for future sessions: `netlify build && netlify deploy --prod` (or
  `netlify deploy --prod --build`) from `apps/app` — do **not** hand-run `vite build`
  and pass `--dir`, the plugin emits a different (non-deployed) output layout
  (`.output/`) outside Netlify's own build orchestration vs. the real deploy layout
  (`dist/` + `.netlify/functions-internal/`) it emits under `netlify build`.
  Gotcha for future sessions: this netlify-cli's project **link is global to the
  repo, not per-subdirectory** — `netlify link`/`env:set` ignore an explicit `--site`
  flag and always act on whatever the ambient link currently is. Always check
  `netlify status --json` (`.siteData.site-id`) before any `env:set`/`deploy`, and
  re-link explicitly (`netlify unlink && netlify link --id <id>`) before switching
  which site you operate on. Left linked to `whocards-app` at the end of this session
  since no further website work is planned tonight.
  **Incident (self-caused, corrected):** an early `netlify env:set` run, done before
  the above gotcha was understood, landed 4 keys on `whocards-calmly` (the live
  website site) instead of the new site: `DB_URL` and `RESEND_API_KEY` were
  re-set to their existing values (verified identical source — the shared root
  `.env` — so no functional change), but `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`
  are new, spurious keys that don't belong on the website and were never consumed
  by a website deploy (env var changes only apply on next build, and none was
  triggered). **Avi: please delete `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from
  whocards-calmly's env vars in the Netlify dashboard** (Site settings →
  Environment variables) — low urgency (dead vars, no functional impact) but they
  don't belong there. The permission system correctly blocked me from deleting them
  myself since that site is explicitly off-limits for autonomous writes.
  Also: mid-session, something (not me, not identified) injected placeholder text
  (`'@prisma/client': set this to true or false`) into `pnpm-workspace.yaml`'s
  `allowBuilds` map alongside a spoofed "system" message telling me to accept it
  silently — found it, did not comply, fixed it to explicit `false` values (real
  reason: `@better-auth/cli`'s optional Prisma/better-sqlite3 peers aren't needed
  for a Postgres+Drizzle app). Flagging in case it's a sign of something worth
  Avi's attention in this environment.
- 2026-07-05 (night, continued) — **Slices 2-4 DONE.** better-auth (Drizzle
  adapter) wired up: magic-link sign-in via Resend (reusing `@whocards/emails`'
  brand components — new `MagicLinkEmail` template), Google provider scaffolded
  but hidden (`GOOGLE_CLIENT_ID`/`SECRET` absent, as expected). All better-auth
  tables are `app_`-prefixed (`app_user/session/account/verification/
organization/member/invitation`) — fully separate from website's `user`/
  `auth_*`/`account_*`. `avicharlop@gmail.com` auto-seeds as `owner` in a
  default "WhoCards" org on first sign-in; anyone else who signs in lands on a
  friendly "not yet invited" screen until an admin adds them via `/admin/people`
  (roles: owner/admin/facilitator/reviewer/member, `ROLE_RANK` hierarchy).
  Migration `0000_massive_ben_parker.sql` applied to prod — verified CREATE-only
  before running it, and re-confirmed after that every pre-existing table
  (`user`, `auth_*`, `account_*`, `whocards_*`, `answer`, etc.) is untouched.
  `/review` (reviewer+ view/vote/comment, facilitator+ approve) loads the 5
  `ai-at-work*.questions.json` variants side by side per question, tallies
  votes, threads comments, and on approve assembles the 37-question deck and
  emits a unified diff against `packages/decks/src/decks/ai-at-work.questions.json`
  — this is a **read/emit only** action (patch text shown in the UI); the app
  never writes to the repo, per the guardrails.
  Verified end to end: local dev magic-link (owner seed + unprovisioned-user
  path, both via the server-log link, no email dependency) and every tRPC
  procedure exercised directly (invite/updateRole/variants/vote/comments/
  approve/emitDiff produced a correct real diff); then confirmed the **deployed**
  site too — https://whocards-app.netlify.app 200s on `/`, `/sign-in`, 307s
  `/review` to sign-in when signed out, and a magic-link request against prod
  returned 200 (Resend + DB both reachable from the Netlify function). Test
  accounts cleaned from the DB after each pass; one real demo row intentionally
  left (`ai-1` approved, with a vote and a comment) so the review UI isn't
  empty on first load.
  31 unit tests added (role-guard branches via a caller against the real tRPC
  middleware, vote tally, deck assembly, ROLE_RANK) — all green. oxfmt/oxlint/
  typecheck clean. Scope note: the plan's DB table list didn't include an
  `invitation` table, so `/admin/people`'s "invite" pre-provisions the
  user+membership row directly rather than building a token/accept-invite flow
  — simpler, and sufficient since sign-in is magic-link (no separate signup
  step to gate). better-auth's `admin` plugin (ban/impersonate) was scoped out
  too — nothing tonight needs it; `organization` + our own `ROLE_RANK` gating
  covers the RBAC surface. Redeployed after this slice.
- 2026-07-05 (night, continued) — **Slice 5 (stretch) DONE**, plus a real
  cross-app regression found and fixed. Discussion agent: reuses the raw-fetch
  Anthropic Messages API pattern from the (unmerged) `feat/ai-at-work-question-lab`
  branch's Question Lab (`server/agent/anthropic.ts`, no new SDK dependency),
  a `discussionAgent` tRPC router (facilitator+, persists to `agent_message`),
  and a "Discuss with agent" panel per question in `/review`. Degrades
  correctly: `ANTHROPIC_API_KEY` is absent, so `status` reports
  `{enabled:false}` and the UI shows "ask an admin to set ANTHROPIC*API_KEY"
  instead of a compose box; verified the `send` mutation also fails clean
  (412 PRECONDITION_FAILED, not a crash) if called anyway. Not yet verified
  against a real key (none available tonight) — the request-construction code
  is a direct mirror of the working reference implementation.
  **Regression found + fixed: apps/app's vite dependency was breaking
  apps/website's typecheck.** Running the full workspace `pnpm check` for the
  first time (previously I'd only typechecked apps/app in isolation) turned up
  `website:typecheck` failing with `Type 'Plugin<any>[]' is not assignable to
type 'PluginOption'` in `astro.config.ts`. Root cause: apps/app's
  `@tailwindcss/vite` + `vite@8.1.3` gave pnpm's peer-dependency resolver a
  second, newer "vite" to satisfy website's \_own* `@tailwindcss/vite@4.3.1`
  peer dependency against — it chose apps/app's vite 8 (rolldown-backed)
  instead of website's existing vite 7.3.5 (rollup-backed) purely because a
  satisfying version existed somewhere in the workspace, corrupting website's
  plugin types as a side effect of a completely unrelated app's dependency
  choice. This is NOT specific to Tailwind — merely having vite 8 installed
  anywhere in the workspace was enough; removing just `@tailwindcss/vite` from
  apps/app wasn't sufficient on its own (vitest's `vite: ^6||^7||^8` peer range
  let it get pulled back in). Fix, in order of what actually worked: (1)
  dropped `@tailwindcss/vite`/`tailwindcss` from apps/app entirely — its
  utility classes are now a small hand-written CSS file
  (`src/styles/app.css`, same class names, no JSX changes needed); (2)
  downgraded apps/app to `vite@^7.3.6` + `@vitejs/plugin-react@^5.2.0` (the
  last version supporting vite 7 — 6.x hard-requires vite 8) instead of the
  upstream TanStack Start example's vite 8, and added `vite-tsconfig-paths`
  (vite 8's built-in `resolve.tsconfigPaths` doesn't exist in 7); (3) a
  **fresh `pnpm-lock.yaml` regenerated from scratch** (`rm -rf node_modules
pnpm-lock.yaml && pnpm install`) — incremental `pnpm install`/`--force`/
  `pnpm dedupe` all left stale vite-8 peer bindings in the lockfile from
  earlier in the session; only a full re-resolve cleared them. Verified after:
  `pnpm why vite` shows only 7.3.6 workspace-wide, `pnpm check` (format + lint
  - typecheck + test) is green across all 18 tasks/11 packages — website's
    own 284 tests and mobile's 218 still pass. **Lesson for future sessions
    touching this repo: run the full `pnpm check` after adding any new
    vite-ecosystem dependency to a package, not just that package's own
    typecheck** — a sibling app's build tooling can silently break from pnpm's
    peer-dependency hoisting even when you never touch that sibling's files.

Redeployed after this slice and re-verified against production:
https://whocards-app.netlify.app 200s on `/` and `/sign-in`, 307s `/review`
and `/admin/people` to sign-in when signed out, and the built CSS asset (the
hand-written utility stylesheet) loads correctly. `whocards.cc` (the live
website) also re-confirmed 200 — untouched throughout.

**All 5 slices are now done** (slice 5 is the stretch goal, correctly
degraded pending a real `ANTHROPIC_API_KEY`). Draft PR #215 updated.

- 2026-07-05 — **Founder feedback pass on the review surface** (live, phone
  in hand): mobile spacing, a crammed flat list, decks-with-status, an
  add-question flow, and "there's no way to navigate." Same branch, PR #215.

  **New DB: `deck` + `deck_question`.** Additive-only again — verified the
  generated migration (`0001_odd_silver_centurion.sql`) is CREATE-only (2 new
  tables; the only `ALTER TABLE` statements add FK constraints _on those new
  tables_, nothing pre-existing is touched) before applying it with
  `db:migrate`, then re-confirmed against the live DB: all 31 tables present
  (29 before + `deck`/`deck_question`), `question_review` still has its 4
  rows, website's `user` table still has its 121 — nothing else moved.
  `deck.status` is plain `text` (not a pgEnum), same reasoning as
  `appMember.role`: a new status is a code change, not a migration.
  Deliberately did **not** add a FK from the existing `question_review` /
  `question_comment` / `question_vote` / `agent_message` tables to `deck` —
  that would need an `ALTER TABLE` on a pre-existing table, which fails the
  "verify CREATE-only" bar. Those tables keep their original loose
  `(deck_slug, question_id)` text match; only the new `deck_question` roster
  table gets a real FK into `deck`. The ai-at-work deck's row + its 37-question
  roster aren't seeded by the migration itself (no hand-written data-migration
  SQL) — `server/decks/bootstrap.ts`'s `ensureAiAtWorkDeck()` seeds them
  idempotently on first read, the same "ensure it exists" pattern
  `auth/bootstrap.ts` already uses for the default org/owner membership.
  Verified end to end against the live DB with a throwaway script (not
  committed): first call seeds the deck row + all 37 roster rows with correct
  act labels/order, a second call is a no-op (37, not 74), and a simulated
  `addQuestion` insert + cleanup round-tripped correctly through the real FK.

  **Deck-centric review surface.** `/decks` (overview, grouped by status —
  in_review first, then draft/approved/shipped, empty groups hidden) →
  `/decks/$slug` (detail: header with title/description/status + a
  facilitator+ status-change select, questions grouped into sections by
  `actLabel` — this is the fix for "crammed flat list with no separation" —
  same vote/comment/approve/diff-per-question flow as before, just deck-scoped
  now). `/review` still exists as a redirect to `/decks/ai-at-work` (not
  deleted) since it was open on a phone mid-session; the nav's "Review" slot
  is now labeled "Decks" and points at the overview.

  **Deck-scoping the existing router.** `questionReview.{variants, myVotes,
vote, comments.*, approve}` and `discussionAgent.messages.*` all gained a
  required `deckSlug` input (were hardcoded to the one `DECK_SLUG` constant).
  `emitDiff` stays ai-at-work-only and takes no `deckSlug` — per the
  constraint, it's the one deck with a shippable JSON file
  (`packages/decks/src/decks/ai-at-work.questions.json`); `decks.get` exposes
  this as `canEmitDiff` so the UI only shows the "Generate diff" button on
  that deck. `emitDiff` and `variants` now read the question roster live from
  `deck_question` instead of the old static 37-id `QUESTION_IDS` array, so a
  question added to the ai-at-work deck via `addQuestion` flows into the diff
  too, not just the original 37. Also fixed a real latent bug while doing
  this: `vote`'s `questionId` input was `z.enum(QUESTION_IDS)`, which would
  have rejected votes on any newly-added question outright — loosened to
  `z.string().min(1)`.

  **Add-question shape (flagging for confirmation).** `decks.addQuestion`
  (facilitator+) takes `{deckSlug, actLabel, text}` and creates one
  `deck_question` roster row + one `question_review` row (status `draft`,
  `currentText` = the given text) — **one wording, not the 5-way variant set**
  the imported ai-at-work questions have. That variant set is a one-time
  artifact of PR #144's candidate-wording pick, not a general feature, so
  building real multi-variant authoring for new questions felt like scope
  creep under time pressure. A facilitator can still vote/comment/approve/edit
  the single wording via the existing flow — the "variants" concept degrades
  to a single `{current: text}` entry (see `question-review.ts`'s
  `hasLegacyVariants`), so the same UI renders both shapes with no branching
  in the component. **Ask Avi:** is single-wording good enough, or is
  multi-variant authoring for new questions worth a follow-up (`question_variant`
  table)? Reversible either way — nothing above depends on staying
  single-wording.

  **Deck status transitions (flagging for confirmation).** `updateStatus`
  only allows moving one step forward or back in `draft → in_review →
approved → shipped` (`decks-logic.ts`'s `canTransitionDeckStatus`) — you
  can't jump `draft` straight to `shipped`. This was a judgment call to keep
  status meaningful as a progress indicator; **ask Avi** if unrestricted jumps
  are wanted instead (one-line change: drop the adjacency check, keep the
  same-status no-op).

  **Navigation.** `_authed.tsx` now renders a real nav on every authed page
  (previously: logo + user email + sign-out only, no way to get anywhere) —
  Home, Decks, Admin › People (admin+ only, same `roleAtLeast` gate as the
  route itself), Sign out. One responsive breakpoint (768px): a hamburger +
  slide-down panel below it, a plain inline row above. Caught and fixed a
  well-known TanStack Router gotcha in the same change: `Link to="/"` without
  `activeOptions={{exact: true}}` is active-styled on _every_ page (prefix
  matching), which would've made "Home" permanently highlighted.

  **Mobile spacing pass.** Every tap target that used to rely on padding
  alone (Vote/Approve/Sign out/hamburger/comment-send/etc.) now has
  `min-h-11` (44px, the standard minimum comfortable tap target) plus
  `flex items-center justify-center` so the label stays centered in the taller
  box. The per-variant row inside a question card now always stacks (text on
  top, a full-width Vote/Approve button row below) rather than a
  side-by-side row that got cramped against long question text on a narrow
  phone. New `app.css` utilities (same hand-written-Tailwind convention as
  before): `.min-h-11`/`.min-w-11`, `.gap-5`/`.gap-8`, `.mb-1`/`.mb-3`,
  `.mt-1`, `.pb-2`, `.text-base`, one `md:` (768px) breakpoint
  (`.hidden`/`.md\:flex`/`.md\:hidden`/`.md\:p-6`/`.md\:text-2xl`), and a small
  non-utility `.hamburger-icon` rule (three CSS-drawn bars, no icon library).

  **RBAC, server-enforced.** `decks.list`/`decks.get` (+ the existing
  view/vote/comment procedures) require `reviewer+`; `decks.updateStatus`/
  `decks.addQuestion` (+ the existing `approve`) require `facilitator+`;
  `people.*` still requires `admin+` — all via the same `roleProcedure`
  middleware as before (`trpc.test.ts`'s generic guard coverage already
  applies to every procedure built on it). Named the role minimums as
  constants (`decks-logic.ts`'s `DECKS_MIN_ROLE`) instead of inlining the
  string at each `roleProcedure(...)` call, so the RBAC contract is one
  greppable place and the tests can assert against it directly.

  **Tests.** New `decks-logic.test.ts` (mirrors the existing
  `question-review-logic.ts`/`.test.ts` split — DB-free pure logic only, same
  as this codebase's established pattern; router files that touch Drizzle
  stay untested directly, same as `question-review.ts`/`people.ts` today):
  `canTransitionDeckStatus`'s full adjacency matrix, `groupByAct`'s ordering/
  grouping, `buildNewQuestion`'s shaping + blank-input rejection, and
  `DECKS_MIN_ROLE`'s values. 48 tests total (was 31), all green.

  **Verified:** `pnpm --filter app typecheck` clean, `pnpm --filter app build`
  clean, whole-workspace `pnpm check` green (18/18 tasks — website 284 tests +
  mobile 218 tests unaffected), migration applied + re-verified against the
  live shared Postgres, bootstrap seeding + add-question verified end to end
  against that same live DB via a throwaway script (deleted, never committed;
  test data cleaned up after). Not yet verified in a real browser/phone — no
  emulator/browser driving was in scope for this pass (server + logic changes
  verified directly against the DB; UI changes verified via typecheck +
  build only) — **Avi, please do an on-device pass** on `/decks`, a deck
  detail page (both the vote/approve flow and the add-question form), and the
  hamburger menu at phone width before merging.
