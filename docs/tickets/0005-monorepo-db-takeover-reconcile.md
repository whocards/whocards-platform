# Monorepo takes over DB migrations — reconcile schema + baseline before any migrate

**Tags:** backend, data, migration
**Surfaces:** backend
**Status:** ✅ baseline applied to Supabase prod (2026-06-18, `00820e8`) — monorepo now owns
migrations; `answer` created, 16 existing tables untouched (public tables 16→17, no drops).
**Remaining:** deliberate cleanup migrations — consolidate the two auth sets (**auth decision
pending**), drop legacy `whocards_*`, drop `user.oc_slug`.

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

## Ground truth — introspected prod (2026-06-18)

`drizzle-kit pull` (read-only) returned **16 tables / 121 columns / 1 enum**. Prod has
accumulated **three eras**; snapshot saved at `/tmp/wc-prod-introspect/` (schema.ts + full DDL):

**Core (keep — actively used):** `user` (incl. `oc_slug`), `purchase`, `shipping`, `card`,
`conference`, `conference_question_tracking`.

**Auth — TWO overlapping sets (only one should survive):**

- `auth_user` / `auth_account` / `auth_session` / `auth_verification_token` + `user_role` enum
  (next-15 NextAuth)
- `account_user` / `account_account` / `account_verificationToken` (an older auth attempt)

**Legacy `whocards_`-prefixed (retire candidates):** `whocards_purchase` / `whocards_session` /
`whocards_shipping` — duplicates of `purchase`/`shipping` from the old prefixed era. (So the
`whocards_` tables really do exist in prod, not just in the stale migration.)

The monorepo `schema.ts` models only **6** of the 16 (`user`, `purchase`, `shipping`,
`conference`, `conference_question_tracking`, + new `answer`). The other **10** are unmodelled —
exactly why a `push`/`migrate` from the current schema would try to DROP them.

## Plan (safe takeover)

1. ~~Introspect~~ **DONE** (2026-06-18) — 16-table snapshot in `/tmp/wc-prod-introspect/`.
2. **Baseline = current prod, exactly.** Adopt the introspected schema as the monorepo's
   `apps/website/src/server/db/schema.ts` (all 16 tables) and generate a baseline `0000` that
   matches prod, marked applied (`--custom` / baseline) so `migrate` never recreates **or drops**
   anything. Delete the stale `whocards_`-prefixed migration.
3. **Deliberate cleanup migrations** (each reviewed, one decision) AFTER the baseline so nothing
   is lost by accident: drop `oc_slug` (approved); drop the legacy `whocards_*`; consolidate the
   two auth sets (keep one, drop the other).
4. **Retire** website-next-15's migration ownership — single source of truth = the monorepo.
5. **Then** apply the ticket 0003 `answer` table migration on top.

## Open decisions (for cleanup, step 3)

- **Auth:** which set survives — `auth_*` (next-15) or `account_*` (older)? Or drop both until the
  monorepo builds auth (ADR-0002 lists auth as later)?
- Confirm the legacy `whocards_*` tables are abandoned (safe to drop).
- Do `apps/website` (Netlify) and `website-next-15` (Vercel) both point at this one Supabase DB at
  runtime today? (Affects cutover sequencing.)

## References

- Deployed schema: `website-next-15/src/server/db/schema/{purchases,cards,auth}.ts`
- Monorepo schema: `apps/website/src/server/db/schema.ts`
- Blocks: `docs/tickets/0003-unify-play-answer-record.md` (the `answer`-table migration)
