# Unify play across app + website, with a permanent Answer record

**Tags:** mobile, website, api, data
**Surfaces:** backend · web · mobile
**Status:** ready to build

## Goal

One unified Global Game across app + website on the shared engine, plus two durable
primitives: a **permanent Answer record** and a **stable Device id**, designed so a Device's
history can later be claimed into an account. No auth, no monetization, no cycle math — those
derive from this data later. See `CONTEXT.md` (Game / Global Game / Device / Answer record)
and `docs/adr/0004-global-game-progress-overlay.md`.

## One open decision: how the host gives the router a db

`@whocards/api` can't import `apps/website` (packages don't import apps), and the tRPC
`Context` is empty today (`createContext: () => ({})`). Options to let `answers.record` persist:

- **Port/adapter (recommended).** `Context = { recordAnswer(input): Promise<void> }`. The
  router validates + calls `ctx.recordAnswer`; the website's `[trpc].ts` `createContext`
  supplies the Drizzle-backed adapter. Keeps `@whocards/api` host-agnostic (ADR-0002),
  no new package. Mobile/web are HTTP clients — they never build context.
- **`@whocards/database` package.** Move `db` + schema out of `apps/website` so the router can
  type `ctx.db` directly. Cleaner long-term and aligns with the Convex ticket (0002), but a
  real refactor — out of scope for this release.

Recommendation: **port/adapter now**, revisit the db package when auth/custom-decks or Convex land.

---

## Scope by surface

Each task is ≈ one commit (≤1500-line diff). Ship **backend → shared → web/mobile** so play
never breaks. A task is done only when its own verification (bottom) is green.

### BACKEND (`apps/website` db + `packages/api`)

- **B1. `answer` table + migration.** Add to `apps/website/src/server/db/schema.ts`:
  `id` (bigint identity) · `created_at` (timestamptz) · `device_id` (text) · `deck_slug` (text)
  · `question_id` (text — Pool ids are strings) · `language` (text) · `type` (text default
  `'answered'`). Indexes on `(deck_slug, question_id)` and `(device_id)`. Run `db:generate`,
  **review the generated SQL**, then `db:migrate`. Conference tracker untouched (folds in later).
- **B2. `answers.record` mutation.** New `packages/api/src/routers/answers.ts`: `record`
  publicProcedure.mutation, zod input `{ deviceId, deckSlug, questionId, language, type? }`,
  calls `ctx.recordAnswer`. Mount in `packages/api/src/root.ts`.
- **B3. Context port.** Widen `Context` in `packages/api/src/trpc.ts` to
  `{ recordAnswer(input): Promise<void> }`. Add a unit test beside `api.test.ts` (happy path +
  bad input) using a fake `recordAnswer`.
- **B4. Host adapter.** In `apps/website/src/pages/api/trpc/[trpc].ts`, change
  `createContext: () => ({})` to supply a `recordAnswer` that inserts into `answer` via Drizzle
  `db`. (This is also the seam the conference tracker migrates onto later.)

### SHARED (`packages/decks`)

- **S1. Serve contract.** Export `type AnswerEvent = { deckSlug; questionId; language }` and a
  `RecordAnswer = (e: AnswerEvent) => void` type so both clients share one typed contract for
  the default Global Game. **No draw-behaviour change** — today's non-repeating pass already is
  the Global draw; this is positioning + types only. Engine stays pure (ADR-0003).

### WEB (`apps/website` — the `Play` island)

- **W1. Device id.** Extract `getDeviceId()` from `Play.tsx`'s `getUserId`; rename key
  `play-user-id` → `whocards-device-id`, adopting any existing `play-user-id` value so current
  devices keep their id.
- **W2. Web tRPC client.** Give the Play island a small `@trpc/client` pointed at `/api/trpc`
  (mobile already has one; the web island posts REST today).
- **W3. Offline queue.** `localStorage`(/IndexedDB)-backed queue: enqueue on serve → attempt
  `answers.record` → drop on success; flush on `online`, app-load, and each serve.
- **W4. Record on serve.** `Play.tsx` already fires on `idx` change — route that through the
  queue calling `answers.record` (alongside/replacing the REST tracking call).

### MOBILE (`apps/mobile` — `play/[deck].tsx`)

- **M1. Deps + Device id.** Add `expo-crypto` (`randomUUID()`) +
  `@react-native-async-storage/async-storage`; new `deviceId` util — mint once, persist, reuse.
- **M2. Offline queue.** AsyncStorage-backed twin of W3 (flush on app-foreground, app-start,
  each serve; bounded retry).
- **M3. Record on serve.** Add a serve-effect in `play/[deck].tsx` keyed on `questionId` that
  enqueues `{ deviceId, deckSlug, questionId, language }` → `answers.record` via the queue.
  Engine stays pure; recorder injected.

## Verification

- **Backend:** `tsc` + the `answers.record` unit test; `db:generate` diff reviewed before
  `db:migrate`; manually hit the mutation and confirm a row lands.
- **Web:** Playwright screenshot loop (existing technique) — play unchanged, network panel shows
  `answers.record` per serve, and a queued send after toggling offline→online.
- **Mobile:** `pnpm -F mobile exec expo export --platform ios` clean; verify a serve enqueues +
  flushes (and survives a kill/relaunch while offline).
- All: `oxlint` + `oxfmt` green (not eslint/prettier).

## Out of scope (deferred, captured elsewhere)

Server-authoritative draw (ADR-0004) · `games_played`/cycle math + live counters (derive from
the Answer record) · Personal Game + monetization (after auth) · dwell-timer "answered" +
Facilitation Mode/Skip · Postgres→Convex (ticket 0002).
