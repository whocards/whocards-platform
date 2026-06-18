# Handoff — Answer record + DB takeover (shipped); auth cleanup next

Branch **`main`** at `/Users/avi/code/whocards/app`, clean at `29194a7`. The unified-play +
Answer-record work and the monorepo DB-migration takeover are **done, merged, and applied to
prod**. What remains is deliberate cleanup (auth) and a few tickets.

## Goal

One unified play experience across web (`apps/website`, Astro) + mobile (`apps/mobile`, Expo)
on the shared engine, with a **permanent Answer record** (every served Question logged per
Device) as the foundation for future global/personal game features. Along the way the monorepo
**took over DB migration ownership** from `website-next-15` (a parked Next.js rewrite).

## Current Progress (DONE — on `main`)

- **Answer record (ticket 0003)** — merged `00820e8`. `answer` table; `answers.record` tRPC
  mutation via a **port/adapter** (`Context = { recordAnswer }`, Drizzle adapter in the
  website's `[trpc].ts createContext`); per-Device anonymous id; an offline queue (persist-first,
  drains the whole backlog, logs failures); record-on-serve wired in **both** clients. Engine
  stays pure (ADR-0003); shared `AnswerEvent`/`RecordAnswer` types in `@whocards/decks`.
- **DB baseline / takeover (ticket 0005)** — merged `00820e8`, **applied to Supabase prod**.
  `apps/website/src/server/db/schema.ts` now models **all 16 prod tables**; one idempotent
  baseline migration `0000_full_baseline.sql` (every stmt `IF NOT EXISTS`/guarded, **zero
  DROP/ALTER**) that also creates `answer`. Verified in prod: public tables **16 → 17**, nothing
  dropped, drizzle migration tracking initialized.
- **Tickets** (`docs/tickets/`): `0001` CJK fonts (mobile, open), `0002` Postgres→Convex
  (parked), `0003` ✅ done, `0004` logging→PostHog (open), `0005` ✅ baseline applied / cleanup
  pending. ADR `0004` = Global Game progress-overlay (model B; authoritative draw A deferred).
- **Project agents** added to `.claude/agents/` (architect, coder, researcher, reviewer — stack
  -adapted; triager excluded). They register only at **session start** (see gotchas).
- **`CONTEXT.md`** glossary covers Game/Global/Personal/Offline play/Answered/Device/Answer
  record, etc.

## Key facts the next agent needs

- **Prod DB = Supabase** (eu-central-1 transaction pooler, port 6543). Creds live in
  `website-next-15/.env.prod` as `DATABASE_URL`. `apps/website` reads `DB_URL` (no local `.env`),
  so to run drizzle against prod: `export DB_URL="$(grep ^DATABASE_URL= ../../website-next-15/.env.prod | sed -E 's/^DATABASE_URL=//; s/\"//g')"` then `pnpm -F website exec drizzle-kit <cmd>`.
  Both `drizzle-kit pull` (introspect) and `migrate` work over the pooler.
- **Connecting to prod needs EXPLICIT user authorization** naming the target — the safety
  classifier blocks otherwise. Read-only introspect snapshot was saved at `/tmp/wc-prod-introspect/`.
- **Prod schema = 16 tables across 3 eras:** core (`user`+`oc_slug`, `purchase`, `shipping`,
  `card`, `conference`, `conference_question_tracking`), **two** overlapping auth sets (`auth_*`
  NextAuth + older `account_*`), and legacy `whocards_*`. The unprefixed names are current; the
  `whocards_` prefix is dead-legacy.
- Lint/format = **oxlint + oxfmt** (never eslint/prettier) for packages + mobile; the **website
  has no eslint** and uses its own **prettier + `astro check`** (excluded from oxlint/oxfmt).
- Never commit `.env*`, real order data, or secrets. Mobile native deps (expo-crypto, async
  -storage) need a dev-client rebuild, not just a Metro reload.

## What Worked

- **Read-only `drizzle-kit pull`** (with explicit auth) to get ground-truth prod schema — the
  Nov-2024 `db_dump.sql` was stale and misleading; introspection revealed the real 16 tables.
- **Idempotent baseline pattern**: `drizzle-kit generate` from a schema that mirrors prod →
  all-`IF NOT EXISTS`/guarded SQL, so `migrate` no-ops existing tables and only creates `answer`.
  Zero data-loss risk, confirmed by grepping for DROP/TRUNCATE/DELETE + a post-migrate count.
- **Augment, don't adopt** the introspected schema: kept the hand-written tables (names,
  relations, consumers intact) and _added_ the 11 missing tables — the raw `drizzle pull` output
  uses generic names and has artifacts.
- Salvaging errored background agents by reviewing + finishing their worktrees directly.
- Verifying integration composes via `tsc` (mobile typecheck proves the un-cast
  `trpc.answers.record` resolves against `AppRouter`).

## What Didn't Work / Gotchas

- **bigint identity `maxValue: 9223372036854775807` (2^63-1) overflows** — JS `Number` rounds it
  to `...776000` > bigint max, and Postgres rejects at parse (`22003`). **Fix: omit `maxValue`**;
  drizzle then emits the correct `MAXVALUE`. (Still present as `ts80008` warnings on the
  `conference*` tables in `schema.ts` — harmless now but the same trap.)
- **First `drizzle-kit migrate` failed and rolled back** (it runs in a transaction) — prod was
  unchanged. Migrations being transactional is the safety net.
- **`drizzle pull` mangles some output**: a `'''next''` default, generic table names — don't adopt
  it wholesale.
- **`SendMessage` (resume agent) is not available** in this toolset; errored background agents
  can't be resumed — salvage their worktrees manually.
- **Custom `.claude/agents/*.md` load only at session start** — can't be used as `subagent_type`
  mid-session after adding them. Use general-purpose carrying the agent's instructions until a
  restart.

## Next Steps (ordered)

1. **Auth decision → cleanup migrations (ticket 0005).** Decide which auth set survives — `auth_*`
   (NextAuth) vs `account_*` (older) — or drop both until the monorepo builds auth (ADR-0002).
   Then write deliberate, reviewed migrations: consolidate auth, `DROP` legacy `whocards_*`, `DROP
user.oc_slug` (all user-approved retirements). Flagged in `schema.ts` + ticket 0005.
2. **Logging wrapper package (ticket 0004).** `@whocards/logger` — console in dev, PostHog in prod;
   replaces the `console.warn`s in both offline queues (mobile needs `posthog-react-native`, net-new).
3. **CJK question fonts (ticket 0001)** — mobile only; options written up (subset vs bundle vs system).
4. **Future Answer-record-derived work** (ADR-0004): `games_played`/cycle counters, Personal Game
   (needs auth + IAP), favorite/thumbs-down buttons, the deferred server-authoritative draw (A).
5. **Mobile device verification** — the Answer-record code is bundle-verified (`expo export`) but
   not run on a device/simulator; confirm recording + offline flush on a rebuilt dev client.

## Pre-existing follow-ups (from the monorepo migration — still open, unrelated)

- Website Pool-data dedup (`questions.json`/`languages.json` still local copies) → point at
  `@whocards/decks`. Web tokens: regenerate `base.css @theme` from `@whocards/tokens`. Website
  type debt (~13 pre-existing `astro check` errors; fold site into oxlint/oxfmt after). tRPC ETag.
- `website-next-15` retirement — **parked** (per user); it still holds the prod creds + dump.

## Run it

```bash
pnpm install
pnpm -F website dev      # needs apps/website/.env for full run (placeholders ok for build)
pnpm -F mobile start     # Expo
pnpm check               # oxfmt --check && oxlint && turbo typecheck test
```
