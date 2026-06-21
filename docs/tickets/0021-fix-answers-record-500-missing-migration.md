# Fix: `answers.record` 500 — the `answer` table has no committed migration

**Tags:** backend, data, migration, bug
**Surfaces:** backend (`apps/website` db), affects web + mobile
**Status:** open (not started). Raised 2026-06-21.

## Context

`POST /api/trpc/answers.record` returns **500**. The mutation code is fine — the router validates
input and calls the Drizzle `recordAnswer` port, which inserts into the `answer` table
(`apps/website/src/pages/api/trpc/[trpc].ts`). The problem is DB state:

- `answer` is defined in `schema.ts` but is **absent from the committed migrations** — `drizzle/`
  has only `0000_full_baseline.sql` (the 16 pre-existing tables) and `grep answer drizzle/`
  (incl. `drizzle/meta/`) returns nothing.
- Per ticket 0005 the table was applied to **Supabase prod out-of-band** (baseline), so prod has it
  but the migration history doesn't. Any DB that lacks the table — or has a drifted shape — 500s on
  insert (`relation "answer" does not exist` or a column error).

This breaks the Answer record on **both** web and mobile (mobile's offline queue posts the same
mutation), so it's also a release blocker (ADR-0005).

## Goal

`answers.record` succeeds against every environment, with the `answer` table captured in a
committed migration and the migration history reconciled with prod.

## Approach

1. Get the exact server error + which DB the failing site connects to (local vs Supabase prod) —
   distinguishes "table missing" from "schema drift".
2. `pnpm db:generate` to emit the `answer` migration from the schema/meta diff; review it.
3. **Reconcile prod** (which already has the table, per 0005): mark the migration as applied / make
   it idempotent (`CREATE TABLE IF NOT EXISTS`) so `db:migrate` doesn't fail on prod — coordinate
   with ticket 0005 (monorepo takes over migrations).
4. Apply to dev (and any env missing it); verify an insert round-trips.

## Acceptance

- A recorded Answer persists from web and mobile; no 500.
- The `answer` table exists in a committed migration; `db:migrate` is clean on dev and prod.

## Notes / out of scope

- Immediate local unblock (if the failing site is on a dev DB): `pnpm --filter website db:push` syncs
  `schema.ts` to that DB — do NOT push against prod.

## References

- `apps/website/src/pages/api/trpc/[trpc].ts`, `src/server/db/schema.ts` (`answer`), `packages/api/src/routers/answers.ts`, tickets 0003 + 0005, ADR-0005
