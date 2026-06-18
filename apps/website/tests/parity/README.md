# Visual-parity suite

Dual-capture Playwright suite that screenshots both the **deployed production site** and the
**locally-built repo** for each route, then pixel-diffs the two images. The HTML report lets you
review every visual delta before the Netlify cutover.

This is a **triage / review tool** — not a strict CI gate. Diffs are expected (the repo may
intentionally improve on the deployed site). The workflow is: run → inspect HTML report →
accept or fix each diff → repeat until cutover confidence is high enough.

## Running the suite

### Default run (compares against https://whocards.cc)

```bash
pnpm -F website test:parity
```

Requires outbound network access to `https://whocards.cc`.

### Override the deployed URL

```bash
DEPLOYED_URL=https://deploy-preview-123--whocards.netlify.app pnpm -F website test:parity
```

### Hermetic self-diff smoke test (no network needed)

Point `DEPLOYED_URL` at the local server — the suite then compares the build to itself and
should yield ~0 diff pixels. Use this to verify the capture machinery works offline.

```bash
DEPLOYED_URL=http://localhost:4321 pnpm -F website test:parity
```

### Skip when no network access

If `DEPLOYED_URL` is explicitly empty, each test skips cleanly:

```bash
DEPLOYED_URL= pnpm -F website test:parity
```

## Reading the HTML report

```bash
pnpm -F website exec playwright show-report
```

Each test row shows **deployed**, **local**, and **diff** PNG attachments. A pink/red pixel in the
diff image indicates a changed region. The diff ratio (% of pixels changed) is shown in the
failure message; the tolerance is **2 %** — any route below that passes even if non-zero.

## v1 scope — static routes only

The v1 manifest covers only routes emitted as static files by `astro build` and served by
`tests/static-server.mjs`:

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

### Routes deferred to v2 (SSR + non-deterministic)

Most of these are `prerender: false` (Netlify functions) and are **not served by the
static-server harness**; `/events/hajnalig/play` is statically served but is non-deterministic
(client shuffle). All are excluded from v1:

| Route                            | Reason deferred                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/play`                          | SSR + question engine shuffles → need `astro dev` harness + seeded/forced deck                              |
| `/[language]/play` (all locales) | Same as above                                                                                               |
| `/events/hajnalig/play`          | Statically served, BUT client engine shuffles questions → self-diff ~4%; needs masking/seeding like `/play` |
| `/contact`                       | SSR form endpoint                                                                                           |
| `/purchase`                      | SSR Stripe flow                                                                                             |
| `/thanks`                        | SSR post-payment                                                                                            |

**How to add them later:**

1. Use `playwright.ssr.config.ts` as the base (it already targets `astro dev`).
2. For `/play`, force a deterministic deck: either pass a fixed `?deck=` param with a seeded
   order, or add a `?seed=` query param to the play engine, so both origins render the same
   question sequence.
3. Add a `playwright.parity.ssr.config.ts` with `testDir: './tests/parity-ssr'` and a
   `webServer` that runs `astro dev`.

## Known-acceptable diffs

Routes where a diff is expected and accepted (e.g. intentional improvements, font rendering
differences between prod CDN and local build). Add a row here after reviewing each run.

| Route        | Viewport | Approx. diff % | Accepted? / Reason                     |
| ------------ | -------- | -------------- | -------------------------------------- |
| _(template)_ | desktop  | _X.X %_        | _describe why this diff is acceptable_ |
