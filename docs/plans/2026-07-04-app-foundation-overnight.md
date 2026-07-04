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
