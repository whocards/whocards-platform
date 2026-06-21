# Fix: `answers.record` 500 — local DB hasn't had migrations applied

**Tags:** backend, data, dev-setup, bug
**Surfaces:** backend (`apps/website` db)
**Status:** **DONE** (resolved by the env consolidation, `9473a5e`). Raised 2026-06-21.

> **Resolution:** the root cause was an unmigrated **localhost** dev DB. After the single-root-`.env`
> work, `DB_URL` points at the prod Supabase pooler (`aws-0-eu-central-1.pooler.supabase.com`), which
> already has the live `answer` table — so local dev no longer hits `relation "answer" does not exist`.
> The website dev server reads the root `.env` via Astro `vite.envDir`, and `/api/trpc/decks.manifest`
> returns 200, confirming env + DB connectivity. The `db:migrate` step below is now only relevant if you
> deliberately point `DB_URL` back at an **isolated localhost** DB. The follow-ups (dev-setup README
> note for the localhost path) are still worth doing and roll into 0005's migration-history reconcile.

## Context

`POST /api/trpc/answers.record` returns **500** when running the site locally.

**Corrected diagnosis** (an earlier note wrongly claimed the `answer` table had no migration — that
grep hit a non-existent `drizzle/` dir instead of the configured `out` dir):

- The `answer` table **is** in the committed baseline `src/server/db/migrations/0000_full_baseline.sql`
  (`CREATE TABLE IF NOT EXISTS "answer" (...)`, columns matching `schema.ts`), and
  `drizzle-kit generate` reports **"No schema changes"** — schema and migrations are in sync.
- `DB_URL` points at **`localhost:5432/whocards`** (a local Postgres).
- The mutation is the only path that writes to the DB (the deck/manifest queries are static, from
  `packages/decks`), so it's the only thing that fails — because the **baseline migration was never
  applied to the local `whocards` database** (`relation "answer" does not exist`).

So this is a **dev-environment** gap, not a code/migration bug.

## Fix

```bash
pnpm --filter website db:migrate   # applies the baseline (IF NOT EXISTS) to localhost:5432/whocards
```

That creates `answer` (and the other 17 tables) on the local DB; `answers.record` then succeeds.
(If the local Postgres isn't running, start it first; the connection string is in `apps/website/.env`.)

## Follow-ups (small)

- Add a dev-setup note (website/root README): after `pnpm install`, run `db:migrate` (and how to get a
  local Postgres) so a fresh checkout doesn't hit this.
- Prod already has `answer` (applied out-of-band, ticket 0005); the broader migration-history
  reconcile remains ticket 0005's scope.

## References

- `src/server/db/migrations/0000_full_baseline.sql` (`answer`), `drizzle.config.ts` (`out`),
  `apps/website/src/pages/api/trpc/[trpc].ts`, `.env` (`DB_URL`), tickets 0003 + 0005
