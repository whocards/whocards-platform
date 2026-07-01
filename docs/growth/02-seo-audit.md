# WhoCards — SEO & Answer-Engine (AEO) Audit

_Scope: `apps/website` (Astro static site, Netlify). Reviewed 2026-06-23 against the codebase
and the PostHog acquisition data in `01-analytics-baseline.md`._

WhoCards has an unusually strong **technical** foundation and an unusually weak **content/
discoverability** posture. The fastest organic wins are not new infrastructure — they are
fixing meta strategy, recovering lost question pages, and turning 14 languages into 14× the
indexable surface.

---

## What's already good (keep)

- **Astro static + Netlify** — fast, crawlable, no JS-render dependency for content.
- `@astrojs/sitemap` and `astro-robots-txt` integrations wired in `astro.config.*`.
- **Canonical, Open Graph, and Twitter card** tags present and well-formed (`Head.astro`).
- **Programmatic OG image per question** (`/og/[language]/[id].png.ts`) — a genuinely great
  asset most sites lack. These doubles as social/share cards (see strategy doc, viral lever).
- Clean URLs (`trailingSlash: 'never'`, `build.format: 'file'`), localized routes under
  `[language]/`, 14-language i18n.

---

## Findings, prioritized

### P0 — do first (highest ROI, mostly small changes)

**1. Recover the question pages (lost long-tail + AEO equity).**
`Head.astro` still contains logic for question metadata, but the `/[language]/question/[id]`
route appears to have been removed — yet `/en/question/40`, `/en/question/1`, `/en/question/33`…
still receive pageviews and are **referred from ChatGPT and Google**. They are almost certainly
**404ing now**. This is the biggest single organic opportunity:

- **66 questions × 14 languages ≈ 900 unique, long-tail content pages** ("deep questions to
  ask…", "conversation starters about…"). Perfect for both classic SEO and answer engines.
- Either **restore them as static pages** (preferred — compounding asset) or **301-redirect**
  the indexed URLs to the closest live page (minimum, to stop the bleed).
- Add an internal-link hub (`/questions` or `/conversation-starters`) linking all of them.

**2. Fix the homepage meta — it is off-strategy.**
The homepage passes `description='Request a WhoCards deck by reaching out through our contact
form.'` (a leftover from a preorder/contact era). The home page should target the actual
high-intent terms the product wins on: _conversation game, conversation cards, deep questions,
icebreaker / connection questions, free online_. The H1 ("Change Your World, One Conversation
at a Time") is good brand but carries no keyword — add a keyword-bearing subhead and a real
meta description.

**3. Add `hreflang` alternates.**
Despite 14 localized homepages, `Head.astro` emits **no `<link rel="alternate" hreflang=…>`**
and only a single `og:locale`. Google cannot associate the language variants, so international
SEO is crippled — exactly the markets (`02` says) that are greenfield. Add a full hreflang
cluster (+ `x-default`) in `Head.astro`, generated from the languages list.

### P1 — high value, slightly more work

**4. Unique, descriptive meta on question pages (when restored).**
Today every question page would get `title = "WhoCards | Question #N"` and the _same_
`description = "Dare to be Curious?"` → thin/duplicate content. Make `title` = the question
text (localized), `description` = a short contextual line. This is what makes 900 pages rank
instead of dedupe.

**5. Add structured data (JSON-LD).** None present today. Quick, high-value wins:

- `Organization` + `WebSite` (with `SearchAction` for sitelinks search) sitewide.
- **`FAQPage`** — FAQs already exist in `src/constants/faqs.ts`; emitting FAQPage schema on the
  home/FAQ section is near-free and surfaces rich results + feeds answer engines.
- `Question`/`CreativeWork` on each question page.

**6. Verify `robots.txt` + sitemap output.** `public/robots.txt` is empty (generated at build
by `astro-robots-txt`). Confirm the built output (a) allows indexing in production, (b)
references the sitemap, and (c) the sitemap includes localized + question routes. Decide
deliberately whether `/events/*` and `/play` should be indexed.

### P2 — polish / compounding

**7. Per-page OG images.** `/ai-at-work` and most pages fall back to one shared `social.png`
(there's an explicit TODO in `ai-at-work.astro`). Per-page OG lifts social CTR; you already
have the OG-generation machinery to reuse.
**8. A content surface (blog / topic hubs).** No top-of-funnel content exists. Topic hubs like
`/conversation-starters/for-teams`, `/icebreaker-questions`, `/ai-at-work` (deepen) capture
high-volume informational queries and feed answer engines — and they localize 14×.
**9. Answer-Engine Optimization (AEO).** ChatGPT already refers traffic. Lean in: clean
question pages with direct, quotable answers; FAQ schema; an `llms.txt`; ensure content is in
HTML (not behind interaction). The multilingual question corpus is ideal LLM-citable material.

---

## Suggested implementation order

1. 301-redirect or restore `/[language]/question/[id]` (stop the 404 bleed) — **P0.1**
2. Rewrite homepage title/description + add keyword subhead — **P0.2**
3. Add `hreflang` + `x-default` in `Head.astro` — **P0.3**
4. Unique per-question meta + JSON-LD (`FAQPage` first, it's free) — **P1**
5. Build `/conversation-starters` hub linking all question pages — **P1/P2**
6. Per-page OG + topic-hub content — **P2**

Each is small in `apps/website`; together they convert a fast-but-invisible site into a
compounding, multilingual, answer-engine-friendly acquisition channel. Quantified impact is in
`03-growth-strategy.md` (SEO lever).
