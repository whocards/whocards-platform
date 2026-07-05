---
name: verify
description: Build/launch/drive recipe for verifying apps/app (WhoCards @ Work, TanStack Start) changes in a real browser. Use before shipping any apps/app UI or tRPC change.
---

# Verifying apps/app in a real browser

apps/app is a TanStack Start (Vite + Nitro) app with no test DB — it talks to the
same shared Supabase Postgres as production. There's no local/sqlite fallback,
so "run it" means running it against that real (dev) database.

## 1. Get a `.env`

A worktree checkout has no `.env` (it's gitignored, not per-worktree). Copy the
one from the primary checkout rather than fabricating values — the required
vars (`DB_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, ...) need to be real:

```bash
cp /Users/avi/code/whocards/app/.env <this-repo-root>/.env
```

Without it, `pnpm build`/`pnpm typecheck` still succeed (env validation only
runs when server code actually _executes_, not during static bundling), which
can be misleading — a green build proves nothing about whether the app boots.

## 2. Run the dev server

```bash
cd apps/app && pnpm dev   # http://localhost:3100, also (re)generates routeTree.gen.ts
```

Run it backgrounded with output redirected to a log file — you'll need to grep
that log for the magic-link line (below), and a plain foreground call blocks.

## 3. Sign in (no real inbox needed)

Magic-link is the only working auth method locally; Google is env-gated and
usually off. In non-production `NODE_ENV`, `auth.tsx`'s `sendMagicLink` always
logs the link before attempting to actually email it:

```
[auth] magic link for <email>: http://localhost:3100/api/auth/magic-link/verify?token=...&callbackURL=%2F
```

Flow: submit the sign-in form with `avicharlop@gmail.com` (the seeded
`OWNER_EMAIL` — auto-provisions as `owner` on first sign-in, see
`server/auth/bootstrap.ts`), then grep the dev-server log for that line and
navigate to the URL directly. The actual Resend send commonly fails in a
sandboxed environment (no network egress) — that's fine, the link is already
logged before the send is attempted, and the UI's "Couldn't send" error text
doesn't mean the sign-in itself failed.

Each token is single-use — get a fresh one per device/session you sign into.

## 4. Drive it

No Chrome extension in this environment; **Maestro's `chromium` device**
(`mcp__maestro__list_devices` → `device_id: "chromium"`) works well for a
TanStack Router / React app — `openLink`, `tapOn`, `inspect_screen` (exact
pixel bounds — more reliable than eyeballing a screenshot for alignment bugs)
all work. Web flows start with `url:`/`openLink`, not `appId`/`launchApp`.

For a genuine phone-width check, the connected iOS simulator
(`list_devices` → an `ios`/`simulator` entry with `connected:true`) shares the
Mac's network stack, so `http://localhost:3100` resolves from Safari there
too — useful for confirming mobile-first CSS actually holds at a real
375-430px width, not just via `md:` breakpoint code review.

**Gotcha hit in practice:** on the real iOS simulator, typing into a
low-font-size `<input>` can trigger iOS's auto-zoom-on-focus, which can persist
across a screenshot in a way that makes the page look broken (content shifted
off-frame) even though a fresh reload renders fine — reload before concluding
a layout bug is real. Also: automated taps that appear to "succeed" (flow
returns success) don't guarantee the real click handler fired — corroborate
with a server-side side effect (e.g. grep the dev log for the expected
`console.log`) before trusting a `tapOn` did what it looked like it should.

## 5. Compare against a prototype spec, don't just read it

If a spec links a validated HTML/CSS/JS prototype, **actually render it**
(serve the file locally, e.g. `python3 -m http.server` in a scratch dir, open
it in the `chromium` device) rather than only reading its source. Reading
caught nothing; rendering it surfaced a real bug in the prototype's own
source (a `display:flex` rule silently defeating an element's `hidden`
attribute per normal CSS cascade rules — screens meant to be mutually
exclusive all rendered stacked) that a diff/code-read alone would have missed,
and confirmed a suspicious-looking layout (a section label detached from the
list below it) was a faithful match to the prototype's own actual rendered
behavior, not a regression — settled by measuring both with
`inspect_screen`, not by eyeballing screenshots.

## 6. Clean up

Kill the dev server, remove the copied `.env` (it's real secrets, no reason to
leave it lying around once you're done), stop any scratch HTTP server.
