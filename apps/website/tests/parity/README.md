# Visual-parity suite

Dual-capture Playwright suite that screenshots both the **deployed production site** and the
**locally-built repo** for each route, then pixel-diffs the two images. The HTML report lets you
review every visual delta before the Netlify cutover.

This is a **triage / review tool** — not a strict CI gate. Diffs are expected (the repo may
intentionally improve on the deployed site). The workflow is: run → inspect HTML report →
accept or fix each diff → repeat until cutover confidence is high enough.

## v1 (static routes) — `test:parity`

### Running

```bash
# Default run (compares against https://whocards.cc)
pnpm -F website test:parity

# Override the deployed URL
DEPLOYED_URL=https://deploy-preview-123--whocards.netlify.app pnpm -F website test:parity

# Hermetic self-diff smoke test (no network needed — compares local build to itself)
DEPLOYED_URL=http://localhost:4321 pnpm -F website test:parity

# Skip when no network access
DEPLOYED_URL= pnpm -F website test:parity
```

Requires outbound network access to `https://whocards.cc` for real runs.

### Routes covered

Only routes emitted as static files by `astro build`, served by `tests/static-server.mjs`:

| Route              | Notes                 |
| ------------------ | --------------------- |
| `/`                | Home (default locale) |
| `/mission`         |                       |
| `/ai-at-work`      |                       |
| `/print`           |                       |
| `/images`          |                       |
| `/legal/pp`        | Privacy policy        |
| `/en`              | Home (English locale) |
| `/he`              | Home (Hebrew / RTL)   |
| `/zh`              | Home (Mandarin / CJK) |
| `/en/images`       | Images (i18n)         |
| `/events/hajnalig` | Event landing         |
| `/404`             | 404 page              |

## v2 (SSR/play) — `test:parity:ssr`

Covers SSR routes (`prerender: false`) that the static-server cannot serve. Uses `astro dev`
as the local harness (via `playwright.parity.ssr.config.ts`).

### Running

```bash
# Default run (compares against https://whocards.cc)
pnpm -F website test:parity:ssr

# Hermetic self-diff smoke test (astro dev vs itself — should yield ~0 diff)
DEPLOYED_URL=http://localhost:4321 pnpm -F website test:parity:ssr

# Skip when no network access
DEPLOYED_URL= pnpm -F website test:parity:ssr
```

### How it works

- **Local server:** `astro dev --port 4321` (started automatically by the Playwright config).
- **Play determinism:** `/play?lang=en&q=1` — the `?q=` deep link forces the Play island to
  start at question 1 instead of shuffling. Both origins see the same question on load.
  The `?lang=` param forces the display language so RTL and CJK layouts are testable.
- **Dev toolbar:** `astro dev` injects `<astro-dev-toolbar>`. It is disabled at source via
  `astro.config` `devToolbar.enabled` (gated on `DISABLE_DEV_TOOLBAR`, which the SSR config sets on
  its `webServer`); `_capture.ts` also hides it via CSS as a fallback for `reuseExistingServer`
  (a dev's own `astro dev` won't have the flag set).
- **Caveat:** dev-mode rendering (`astro dev`) vs production rendering may introduce minor noise
  (e.g. Vite HMR scripts, slightly different asset hashes). Diffs from this source are normal —
  this is a triage tool. Compare the deployed vs local screenshots visually and document
  acceptable diffs in the table below.
- **client:only islands:** The Play component is `client:only='react'` — it hydrates after the
  initial HTML. The spec waits for a stable play element selector before screenshotting.

### Routes covered

| Route               | Notes                             |
| ------------------- | --------------------------------- |
| `/play?lang=en&q=1` | Default deck, English, question 1 |
| `/play?lang=he&q=1` | RTL Hebrew, question 1            |
| `/play?lang=zh&q=1` | CJK Mandarin, question 1          |
| `/play?lang=en&q=5` | English, question 5 (second card) |
| `/contact`          | SSR contact form                  |

### Routes still deferred (excluded from v2)

| Route                   | Reason still excluded                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `/purchase`             | Calls Stripe `createSession` on render; throws/redirects under placeholder `.env` (no Stripe key) |
| `/thanks`               | Requires valid `?session_id=` Stripe session; redirects to `/contact` without one                 |
| `/events/hajnalig/play` | Statically served but client engine shuffles questions; needs masking/seeding (separate ticket)   |
| `/[language]/play`      | Localised play routes; same deep-link approach works — add to manifest when needed                |

## Reading the HTML report

v1 and v2 write to separate folders, so running one never overwrites the other's report:

```bash
pnpm -F website exec playwright show-report                       # v1 (playwright-report/)
pnpm -F website exec playwright show-report playwright-report-ssr # v2 (separate folder)
```

Each test row shows **deployed**, **local**, and **diff** PNG attachments. A pink/red pixel in the
diff image indicates a changed region. The diff ratio (% of pixels changed) is shown in the
failure message; the tolerance is **2 %** — any route below that passes even if non-zero.

## Known-acceptable diffs

Routes where a diff is expected and accepted (e.g. intentional improvements, font rendering
differences between prod CDN and local build). Add a row here after reviewing each run.

| Route        | Viewport | Approx. diff % | Accepted? / Reason                     |
| ------------ | -------- | -------------- | -------------------------------------- |
| _(template)_ | desktop  | _X.X %_        | _describe why this diff is acceptable_ |
