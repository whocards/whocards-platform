# Visual-parity snapshot suite — deployed site vs this repo, to de-risk cutover

**Tags:** testing, web, migration
**Surfaces:** web
**Status:** v1 + v2 **DONE** (v1 static routes `38df274`; v2 SSR/play `d4a6aaf`) · a few routes
still deferred (Stripe state / client shuffle)

> **v1 — static routes (38df274):** `playwright.parity.config.ts` + `tests/parity/` (manifest,
> `parity.spec.ts` dual-capture + pixelmatch diff) + `test:parity`. Static build served by
> `tests/static-server.mjs`. Stabilisation: block PostHog/consent, freeze CSS motion, mask the
> GSAP `.rotate` hero words, `fonts.ready` + `networkidle`. Two viewports (1280×800, 390×844).
>
> **v2 — SSR/play (d4a6aaf):** `playwright.parity.ssr.config.ts` + `tests/parity-ssr/` + shared
> `tests/parity/_capture.ts` (capture/diff/stabilisation extracted; v1 refactored to a thin loop,
> behaviour unchanged). Local target = `astro dev`. Deterministic `?lang=&q=` deep links
> (`Play.tsx` honours `?q=` → no shuffle): `/play?lang={en,he,zh}&q=1`, `/play?lang=en&q=5`,
> `/contact`. Dev toolbar disabled at source (`astro.config` `devToolbar.enabled`, gated on
> `DISABLE_DEV_TOOLBAR`) + CSS fallback. Separate report folder (`playwright-report-ssr/`).
>
> **Shared:** `DEPLOYED_URL` defaults to `https://whocards.cc` (overridable; explicit-empty → skip).
> Triage tool, not a CI gate.
>
> **Real run findings (vs `https://whocards.cc`):** marketing pages already match (5 pixel-perfect;
> `/` + `/images` diffs were image-capture harness artifacts — files byte-identical to the old repo,
> nothing deleted in the migration); **`ai-at-work` the repo is AHEAD** (deployed still shows
> `TODO(copy)` placeholders); SSR/play **10/10 <2%**. Net: the repo is at-or-ahead of deployed.
>
> **Still deferred:** `/purchase` + `/thanks` (need real Stripe session/keys — throw/redirect under
> placeholder `.env`); `/events/hajnalig/play` (client shuffle — needs masking/seeding). Also a
> known follow-up: harden the v1 image-capture (lazy-load) so image-heavy-page numbers are trustworthy.

## Context

`apps/website` (Astro, `output: 'static'`, Netlify adapter) is the **candidate** that will replace
the **currently deployed** production website. Before we flip the deployment over (the cutover), we
want confidence that this repo renders the live pages faithfully — and a reviewable list of where
it does **not**.

The deployed site is the _predecessor being retired_, so it is **not** expected to be
pixel-identical to this repo. This suite is a **triage / parity-review tool**, not a strict
pass/fail gate: it surfaces every visual diff so we can decide, page by page, which diffs are
acceptable (or intended improvements) and which are regressions to fix before switching over.

**What already exists (reuse it):**

- Playwright is wired in `apps/website`: `playwright.config.ts` + `playwright.ssr.config.ts`,
  specs in `tests/e2e/` (`smoke`, `contact`, `event-play`, `og-images`), scripts `test:e2e` /
  `test:e2e:ssr`.
- The site can't `astro preview` (Netlify adapter), so the existing config **builds once** and
  serves `dist/` with a zero-dep Node server: `tests/static-server.mjs` on **port 4321**
  (`http://localhost:4321`). SITE_URL bakes absolute og/image URLs against that origin
  (`src/constants/env.ts`), so the local target must stay on 4321.
- The site is multilingual: 14 languages in `src/data/languages.json`, including **RTL Hebrew
  (`he`)** and **CJK (`zh`, `jp`)**, served under `/[language]/…` routes.

## Goal

A Playwright suite that, for a curated set of routes, captures the **deployed** page and the
**locally-built** page and **diffs them**, producing a reviewable HTML report of the per-route
visual deltas — so cutover becomes "review the diffs, accept/fix, then switch" instead of a leap.

## Approach

**Dual-target capture (preferred over committed golden baselines).** A single run screenshots both
origins for each route and pixel-diffs the two buffers, so there are **no drift-prone baseline PNGs
in git** and the comparison always reflects the live deployed site at run time.

- **Local target:** reuse the existing build + `tests/static-server.mjs` on `:4321` (a new
  `playwright.parity.config.ts` `webServer`, mirroring `playwright.config.ts`).
- **Deployed target:** a `DEPLOYED_URL` env var (no hardcoded prod host). **Confirm the canonical
  production domain** — the `analyze` script references `https://calmly.whocards.cc`; verify that
  is the live site (or the correct apex) before defaulting it.
- For each route in a shared **manifest**, navigate `${DEPLOYED_URL}${path}` and
  `http://localhost:4321${path}`, screenshot both (full page), and compare with a tolerance
  (`maxDiffPixelRatio`, ~0.02 to start) — emit the diff image into the report on mismatch.

**Stabilise dynamic content (essential — otherwise every run is noise):**

- Disable analytics so PostHog/consent UI never paints (e.g. block the PostHog host via
  `page.route`, and/or set the env that gates `PostHog.astro`).
- Freeze motion: inject `* { animation: none !important; transition: none !important;
caret-color: transparent !important; }`.
- Wait for `document.fonts.ready` + `networkidle` before each shot (CJK/Hebrew fonts load async).
- **Play screen** (`/play`, `/[language]/play…`): the engine **shuffles** the Question order, so
  raw screenshots will never match — either **mask** the question-content region
  (`toHaveScreenshot({mask: [...]})` / clip), or drive a **fixed deck + seeded/forced order** so
  both origins show the same Question. Document whichever is chosen.
- Dismiss/await any cookie or interstitial banner consistently on both origins.

**Routes (curated, not the full 14×N matrix).** Start with the static marketing pages and a small
i18n cross-section:

- Marketing: `/`, `/mission`, `/ai-at-work`, `/contact`, `/gift`, `/preorder`, `/purchase`,
  `/print`, `/thanks`, `/legal/*`, `/404`.
- Play: `/play` (+ one localized play route).
- i18n cross-section: default `en`, RTL `he`, CJK `zh` for a representative page (e.g. home + play).
- Two viewports: desktop (1280×800) and mobile (390×844).

## Scope by surface

### WEB (`apps/website`)

- `playwright.parity.config.ts` — own `testDir` (`tests/parity/`), `webServer` that
  `pnpm build && node tests/static-server.mjs` on 4321, chromium project(s) for the two viewports,
  HTML reporter.
- `tests/parity/routes.ts` — the route manifest (paths + per-route options: viewport set, mask
  selectors, play-seed).
- `tests/parity/parity.spec.ts` — the dual-capture + diff loop with the stabilisation hooks above.
- `tests/parity/README.md` — how to run, how to read the report, and the running list of
  **known-acceptable diffs** (intended changes vs regressions).
- `package.json` script: `test:parity` (e.g. `playwright test -c playwright.parity.config.ts`),
  taking `DEPLOYED_URL`.

## Notes / out of scope

- **Not a CI gate (initially).** The deployed site is being replaced, so real diffs are expected;
  run it on demand for cutover review. A tightened threshold can become a gate _after_ cutover, to
  catch regressions against the new baseline.
- **Out of scope:** fixing the diffs, the actual Netlify/DNS cutover, dynamic SSR/`/api` endpoints,
  and the `/og/**` generated `.png` image endpoints (the latter could be a follow-up parity check —
  they're already exercised by `tests/e2e/og-images.spec.ts`).
- Asset-hash/URL differences don't affect pixels; genuinely dynamic content (dates, live counts)
  should be masked rather than chased.
- Requires network access to `DEPLOYED_URL` at run time; gate the suite so it skips cleanly when
  `DEPLOYED_URL` is unset.
