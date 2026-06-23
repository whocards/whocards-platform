# WhoCards Growth Analysis (2026-06-23)

A PostHog-grounded analytics review, SEO/AEO audit, and business/marketing growth strategy with
12-month projections. Written in a worktree so it stays out of the way of in-flight app work.

## Read in this order

1. **[01-analytics-baseline.md](./01-analytics-baseline.md)** — what the PostHog data actually
   says: current/historical stats, the event-led traffic spike, engagement quality, language &
   geography, and the patterns that drive everything else.
2. **[02-seo-audit.md](./02-seo-audit.md)** — technical-vs-content posture, prioritized fixes
   (recover question pages, homepage meta, hreflang, JSON-LD, AEO).
3. **[03-growth-strategy.md](./03-growth-strategy.md)** — business analysis, five prioritized
   growth levers, instrumentation, current→historical→projected stats (3 scenarios with
   assumptions), and a 90-day plan.

## TL;DR

- **Data is ~3.5 weeks old and ~75% one event** (Hajnalig, Hungary). There is no real history
  yet — this is a launch snapshot. 307 visitors, 88% mobile, 96% Hungarian.
- **The content works** (3,400+ deep engagements in one event); **distribution and retention do
  not** (traffic halves weekly to ~zero; only ~6% reach the core product; ~0% return).
- **The #1 problem is the leaky bucket.** Fix retention (email capture + a reason to return)
  before spending on acquisition — it gates every other lever.
- **Repeat what worked:** productize the sponsor-funded **event playbook**, then layer a
  **compounding multilingual SEO/AEO** content engine (≈900 question pages, 14 languages,
  already cited by ChatGPT), **mobile share virality** (you auto-generate share cards), and the
  **AI-at-work B2B wedge** for first revenue.
- **12-month MAU:** status-quo ~150–350 (sawtooth) → conservative ~2–4k → aggressive ~10–25k +
  B2B revenue. The spread is almost entirely _retention rate × one breakout channel_.

> Mission and growth point the same way here: help more people have a real conversation, in
> their language, and come back for another. Estimates are planning ranges, not forecasts —
> revisit after 60–90 days of clean, multi-channel data.

## Caveats

- Built from a young dataset dominated by a single activation; ranges are intentionally wide.
- Strategy references `docs/strategy/ai-at-work.md` and `ai-checkin-landing-copy.md`
  (referenced by the codebase but on another branch, not in `main` at time of writing).
