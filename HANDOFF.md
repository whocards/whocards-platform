# Handoff — Unified play + permanent Answer record

Branch **`main`** at `/Users/avi/code/whocards/app` (monorepo already merged; the old
`feat/monorepo` handoff this replaces is summarized under "Pre-existing follow-ups" below).

## Goal

Ship **one unified Global Game** across web (`apps/website`) + mobile (`apps/mobile`) on the
shared headless engine, and add two durable primitives:

1. **Answer record** — a permanent, append-only history of every Question a Device answers.
2. **Device id** — a stable anonymous per-install/browser UUID, designed so a Device's history
   can later be **claimed/merged into an account**.

No auth, no monetization, no cycle math in this release — those all _derive_ from the Answer
record later. Full design in `CONTEXT.md` + `docs/adr/0004` + ticket `docs/tickets/0003`.

## Current Progress

**Design is settled and written down** (this session was a grill-with-docs interview, not code):

- **`CONTEXT.md`** (glossary) — added: Game, Global Game, Personal Game, Offline play,
  Answered, Skipped, Facilitation Mode, Device, Answer record.
- **`docs/adr/0004-global-game-progress-overlay.md`** — Global Game is a **shared-progress
  overlay (model B)**, not a server-authoritative draw (model A, deferred). Per-Deck scope;
  "a game played" = one completed cycle of a Deck.
- **`docs/tickets/0003-unify-play-answer-record.md`** — the build plan, **scoped by surface**
  (Backend / Shared / Web / Mobile), commit-sized tasks, verification per task.
- **`docs/tickets/0002-postgres-to-convex-migration.md`** — parked (future, backend).
- **`docs/tickets/0001`** — annotated with surface scope (mobile).

⚠️ **All of the above are UNCOMMITTED** (`git status`: `CONTEXT.md` modified; ADR-0004 + tickets
0002/0003 untracked). First action: commit them as a docs commit.

**Also shipped earlier this session (committed):** mobile player-bar UI — close ✕ as a
`bg-darker/80` chip top-right, bottom action bar (Back · Share · Language · Next), latest
commit `d79686e`.

## Key design decisions (so they aren't re-litigated)

- **"Game" = a draw policy over a Deck**, content-blind. Games differ only by the _scope_ of
  the "already answered" set. Two on the horizon: **Global** (default, free, always recording)
  and **Personal** (later, paid). "Classic/offline as a no-recording mode" was **rejected**.
- **"Answered" = served** for now (every serve records); a dwell-timer refinement and
  Facilitation Mode's Skip are future. Never an explicit tap.
- **Recording is ALWAYS on**, including offline — offline just **queues on-device and flushes on
  reconnect**. "Offline" is a connectivity state, not a separate Game.
- **Engine stays pure; the answer-recorder is injected per client** (ADR-0003, no shared UI).
  The draw itself does **not** change — today's `nav.ts` non-repeating pass already _is_ the
  Global draw. The release is plumbing (record + device id), not new gameplay.
- **Write path = one tRPC `answers.record` mutation** both clients call (unify app + website),
  not another REST endpoint.

## What Worked

- **Grill-with-docs**: walking the design tree one decision at a time, recording each resolved
  term in `CONTEXT.md` inline and the one hard-to-reverse trade-off as ADR-0004.
- **Grounding every recommendation in the actual code** before asserting (found: web already
  mints a device id via `crypto.randomUUID()`+localStorage `play-user-id`; web `Play.tsx`
  already fires a serve-effect on `idx`; tRPC `Context` is empty; both clients already share
  `@whocards/decks/engine`). This shrank the perceived scope a lot.
- Mobile visual verification via **Expo web + Playwright screenshots** (390×844 / 844×390),
  scripts placed in `apps/website` where `@playwright/test` resolves, deleted after use.

## What Didn't Work / Gotchas

- **`@whocards/api` cannot import `apps/website`** (packages don't import apps). So the router
  can't type `ctx.db` directly → use the **port/adapter** (`Context = { recordAnswer }`, host
  supplies the Drizzle adapter in `[trpc].ts createContext`). The `@whocards/database` package
  extraction is the long-term fix but is **out of scope** here (ties into the Convex ticket).
- **Pool `questionId` is a string** (`QuestionId = string`), but the existing
  `conference_question_tracking.question_id` is `smallint`. The new `answer.question_id` must be
  **text**. Don't copy the smallint.
- **Mobile has no crypto/storage libs** — `expo-crypto` + `@react-native-async-storage/async-storage`
  are net-new deps for the device id + offline queue.
- **The web Play island has no tRPC client** (it POSTs to the REST conference tracker today);
  unifying on `answers.record` means giving it a small `@trpc/client`.
- Tooling: **oxlint + oxfmt only** (never eslint/prettier). Never commit `.env*`, real order
  data, or literal secrets. `app.json` orientation/font changes need a native rebuild, not a JS
  reload.

## Next Steps (ordered — pick up here)

1. **Commit the docs** (`CONTEXT.md`, `docs/adr/0004`, `docs/tickets/0002`, `0003`) — one docs commit.
2. **Backend B1** — add the `answer` table to `apps/website/src/server/db/schema.ts`,
   `db:generate`, **stop and have the generated SQL reviewed**, then `db:migrate`.
3. **Backend B2–B4** — `answers.record` mutation (`packages/api/src/routers/answers.ts`),
   widen `Context` to the `recordAnswer` port, wire the Drizzle adapter in `[trpc].ts`, add a
   unit test. (Server ships behind nothing — safe to land first.)
4. **Shared S1** — export the `AnswerEvent` / `RecordAnswer` contract from `@whocards/decks`.
5. **Web W1–W4** then **Mobile M1–M3** — device id, offline queue, record-on-serve. Both go
   through the queue so recording is always-on. Verify with the Playwright network/offline
   check (web) and `expo export` + a kill/relaunch-while-offline check (mobile).

Each numbered task in ticket 0003 has its own verification block; keep diffs ≤1500 lines and
commit per task.

---

## Pre-existing follow-ups (from the monorepo migration — unrelated, still open)

These survive from the prior handoff; not blockers for the work above:

1. **Website Pool-data dedup** — `questions.json`/`languages.json` are still local copies in
   `apps/website`; repoint consumers (`WhoCard.astro`, `pages/[language]/images.astro`,
   `pages/images.astro`, `pages/og/[language]/[id].png.ts`, `server/card-image.ts`,
   `types/index.ts`, `utils/gameplay.ts`, `utils/language.ts`) to `@whocards/decks` pool.
2. **Web tokens consumption** — regenerate `apps/website/src/styles/base.css` `@theme` from
   `@whocards/tokens` (only mobile consumes tokens today).
3. **Website type debt** — `astro check` reports ~9 pre-existing errors; website is excluded
   from oxlint/oxfmt + `turbo typecheck`. Fix, then fold the site into oxlint/oxfmt.
4. **tRPC ETag** — mount sets `Cache-Control` only; add `ETag` if wanted (ADR-0002).
5. **Excluded printable PDFs** — `apps/website/public/cards/*.pdf` (~147 MB) left out; see that
   dir's README to restore via LFS/external.

## Run it

```bash
pnpm install
pnpm -F website dev      # needs apps/website/.env (placeholders present locally)
pnpm -F mobile start     # Expo
pnpm check               # oxfmt --check && oxlint && turbo typecheck test
```
