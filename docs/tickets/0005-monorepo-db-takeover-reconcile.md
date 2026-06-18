# Monorepo takes over DB migrations — reconcile schema + baseline before any migrate

**Tags:** backend, data, migration
**Surfaces:** backend
**Status:** open — **blocks the ticket 0003 migration apply**

## Context

The monorepo (`apps/website`) will own DB migrations going forward. `website-next-15` (a
Next.js rewrite, a temp test being retired) currently owns the **deployed Supabase prod DB**
(eu-central-1 pooler). Their Drizzle schemas have **diverged**, and the only local dump
(`website-next-15/db_dump.sql`) is from **Nov 2024** — it predates the divergence, so it is
**not** ground truth.

## The divergence (read from schema code)

**`website-next-15` (deployed) has, that `apps/website` lacks:**

- `user.oc_slug` column — **approved for retirement** (intentional drop, not preserved)
- a `card` table
- NextAuth tables `auth_user` / `auth_account` / `auth_session` / `auth_verification_token`
  - a `user_role` enum

**`apps/website` has, that next-15 lacks:**

- `conference`, `conference_question_tracking`
- `user` **without** `oc_slug`
- a stale `0000` migration that creates **`whocards_`-prefixed** tables (legacy; never matched
  current prod, which is unprefixed)

## Data-loss risk (why this gates everything)

- **`drizzle-kit push`** from the monorepo (schema is missing `card`/`auth_*`/`oc_slug`) would
  diff against prod and emit **`DROP TABLE`/`DROP COLUMN`** for them. **Never run push against
  prod from the current schema.**
- **`drizzle-kit migrate`** with the stale `whocards_`-prefixed `0000` chain conflicts with the
  real (unprefixed) prod and would try to recreate existing tables.

## Plan (safe takeover)

1. **Introspect** the live prod DB read-only (`drizzle-kit pull`) → authoritative current
   schema. Requires explicit prod-access approval (or run by a human).
2. **Reconcile** `apps/website/src/server/db/schema.ts` to match actual prod: add `card`, the
   `auth_*` tables + `user_role` enum. **`oc_slug` is approved for retirement** — drop it
   intentionally (a deliberate, user-approved column drop), so the reconciled schema omits it.
   Confirm whether `conference*` exist in this DB and keep/relocate accordingly.
3. **Baseline migration**: regenerate history so `0000` reflects _current prod_ (drop the stale
   `whocards_` migration) and mark it applied (a baseline / `--custom`) so `migrate` never
   recreates existing tables.
4. **Retire** website-next-15's migration ownership — single source of truth = the monorepo.
5. **Then** apply the ticket 0003 `answer` table migration on top.

## Open questions (introspect answers these)

- Are the `conference*` tables actually in this Supabase DB, or in a different/older DB?
- Do `apps/website` (Netlify) and `website-next-15` (Vercel) both point at this Supabase DB at
  runtime today?

## References

- Deployed schema: `website-next-15/src/server/db/schema/{purchases,cards,auth}.ts`
- Monorepo schema: `apps/website/src/server/db/schema.ts`
- Blocks: `docs/tickets/0003-unify-play-answer-record.md` (the `answer`-table migration)
