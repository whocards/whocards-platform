# WhoCards — Growth Strategy, Business Analysis & Projections

_Written as a business/marketing analysis on top of `01-analytics-baseline.md` (data) and
`02-seo-audit.md` (discoverability). 2026-06-23._

> **Mission framing.** WhoCards exists to help people connect honestly in a lonely, anxious
> time. That is not a footnote to the business — it is the wedge. The same mission powers the
> two channels that already show signal (live events and timely AI-at-work content) and is the
> reason content compounds. The strategy below is built to grow _humans connecting_, and to
> make that financially self-sustaining so it can keep going.

---

## 1. Where the business actually is (honest read)

- **Stage:** pre-product-market-fit. One successful **event activation** (Hajnalig, Hungary),
  no retention loop, no monetization live, native app nascent.
- **What works:** the cards themselves (very deep engagement per session), live events as a
  channel, a strong technical/i18n foundation, and early organic + AI-search discoverability.
- **What's missing:** a reason to come back, an identity/email join key, attributable
  acquisition, and any productized repeatable channel beyond "we ran an event."
- **Assets others don't have:** 66 curated questions in **14 languages**, auto-generated
  per-question share cards, a B2B/event playbook that already paid off (sponsor-funded), and a
  timely **AI-at-work** angle with a research-backed landing page already built.

**Competitive context.** The category leader is _We're Not Really Strangers_ (consumer, viral
Instagram-led, physical-first). Others: TableTopics, The And, BestSelf, "Actually Curious."
WhoCards' defensible angles vs. them: **free online multilingual play**, **events/B2B**, and
**AI-at-work timeliness**. WhoCards should not try to out-WNRS WNRS on US consumer virality
from a standing start; it should win the lanes incumbents ignore — non-English markets,
events/conferences, and workplace/AI anxiety.

---

## 2. The core problem in one sentence

**Acquisition works in bursts; nothing is retained.** Every other metric is downstream of the
leaky bucket. Fixing retention is the precondition for _any_ acquisition spend to pay off.

---

## 3. Five growth levers (prioritized)

Prioritization is roughly ICE (Impact × Confidence ÷ Effort). Do them in order; 1 gates the
rest.

### Lever 1 — Plug the bucket: a retention loop (PRECONDITION)

**Why:** weekly traffic halves to zero between events. With ~0% return, CAC is infinite.
**Do:**

- Capture an identity/email at the _peak of engagement_ (end of a deck / after N questions),
  not via a cold form. Tie it to the Device→Account "claim" concept already in CONTEXT.md.
- Give a reason to return: weekly "new deck / question of the week," a lightweight streak, or a
  "continue your Global Game" nudge (the shared-progress mechanic is a built-in return hook —
  use it).
- Add a share action ("send this question to someone") — retention _and_ acquisition in one.
  **Confidence:** high. **Effort:** medium. **This is the #1 priority.**

### Lever 2 — Productize the event playbook (the one channel that worked)

**Why:** one event = ~75% of all traffic and 3,400+ engagements, **sponsor-funded**. It is
proven, warm, high-margin, and repeatable — and it doubles as B2B lead-gen.
**Do:**

- Templatize "WhoCards for your event/festival/conference/offsite": branded deck + QR + a live
  shared board. Self-serve or light-touch sales.
- Always UTM the QR. Always capture emails on-site (Lever 1) so the event's audience becomes a
  retained base, not a spike.
- Pipeline events → B2B (HR/teams) via the AI-at-work deck.
  **Confidence:** high. **Effort:** low-medium. Cadence target: **≥1 event/month.**

### Lever 3 — SEO/AEO long-tail content engine (compounding, global, cheap)

**Why:** ~900 question pages × unique meta = a compounding, multilingual moat already
half-built; ChatGPT/Google already cite/refer. See `02-seo-audit.md`.
**Do:** recover question pages, fix homepage/hreflang/meta, add FAQ + Question JSON-LD, build
`/conversation-starters` hubs. Localize 14×.
**Confidence:** medium-high. **Effort:** medium. **Payoff:** lagged 2–6 months, then compounds.

### Lever 4 — Mobile-first social / share virality

**Why:** 88% mobile; you already auto-generate beautiful per-question cards (perfect shareable
units). This is the WNRS playbook adapted.
**Do:** one-tap share of a question card to IG/TikTok/WhatsApp; "question of the day" social
cadence; UGC ("answer this with someone you love"). Mission content travels.
**Confidence:** medium (virality is never guaranteed). **Effort:** medium.

### Lever 5 — AI-at-work B2B wedge (monetization)

**Why:** timely, research-backed landing already built (`/ai-at-work`), email capture live; the
highest willingness-to-pay (companies buy team workshops/subscriptions; consumers rarely pay).
**Do:** turn the landing into a funnel — free deck → team email capture → paid facilitated
workshop / team subscription. Use events (Lever 2) as the top of this pipeline.
**Confidence:** medium. **Effort:** medium-high. **This is the most likely first revenue.**

---

## 4. Funnel & instrumentation to run all of this

Stand up these PostHog insights as the permanent scoreboard (see baseline §7):

- **Acquisition:** pageviews/visitors by UTM source + referrer (requires UTM'd links).
- **Activation funnel:** visit → `deck_opened` → `game_started` → ≥5 questions → email capture.
  Unify the legacy `event_question_*` and new `question_*`/`deck_opened` events so events and
  Library report into one funnel.
- **Retention:** weekly stickiness + N-week retention, keyed on Device/identified email.
- **B2B:** `/ai-at-work` → deck → email → sales-qualified.

You cannot manage what you cannot see; today retention and acquisition source are both
invisible.

---

## 5. Stats: current → historical → projected

### Current (2026-05-31 → 06-23, ~3.5 weeks)

- 307 unique visitors, 1,603 pageviews, ~3,450 questions engaged, **~6% reach the core
  product**, **~0% measured retention**, 88% mobile, 75% Hungary, 96% Hungarian-language.

### Historical

- **There is none.** Instrumentation began ~2026-05-31. The "history" is a single event spike
  now decaying ~50%/week. First action: establish a clean weekly baseline so the _next_ 90 days
  are measurable.

### Projected — 12-month MAU scenarios

> These are **planning estimates, not forecasts.** With ~3.5 weeks of single-event data, ranges
> are wide on purpose. Each scenario states the _changes_ that drive it and the _assumptions_.
> Revisit after 60–90 days of clean, multi-channel data.

| Scenario             | What changes                                                  | Key assumptions                                                                                                               | MAU by M12                                       |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **A — Status quo**   | Nothing; sporadic events                                      | ~0% retention; events 1–2×/yr; organic flat                                                                                   | **~150–350** (sawtooth, decays between events)   |
| **B — Conservative** | Levers 1+2+3: retention loop live, ≥1 event/mo, SEO recovered | 20–30% M1 retention; ~1 event/mo adding 150–300 retained users; SEO ramps to ~1–3k organic visits/mo by M12 at ~5% activation | **~2,000–4,000**                                 |
| **C — Aggressive**   | All 5 levers; social hits; B2B pipeline                       | 30–40% retention; events scale + referrals; SEO compounds 14× across locales; one social channel breaks out; B2B adds teams   | **~10,000–25,000** + first recurring B2B revenue |

**How the conservative (B) number is built (so you can pressure-test it):**

- _Events:_ 12 events × ~200 attendees × ~60% play × ~25% retained ≈ **~360 retained/yr** plus
  in-month spikes.
- _SEO:_ recovered + localized question pages → ramp 0 → ~2,000 organic visits/mo by M12;
  ~5% activate, ~25% retained → **~25 new retained/mo at steady state, compounding.**
- _Social/direct:_ modest, ~10–20% uplift on the above.
- Sum with churn applied lands the **active** base in the low thousands. The spread between B
  and C is almost entirely **retention rate × whether one viral/social or B2B channel breaks
  out** — which is why Lever 1 and one breakout channel are the whole game.

**Leading indicators to watch (they predict which scenario you're in):**

1. **Week-1 retention** of event cohorts (target >20% → you're at least in B).
2. **Email capture rate** at end-of-deck (target >15%).
3. **Organic (Google + AI) visits/mo** trending up by M3 (SEO working).
4. **Events booked/month** (channel is repeatable).
5. **B2B email→call conversion** on `/ai-at-work`.

---

## 6. 90-day action plan

**Days 0–30 (instrument + plug):** unify events into one funnel; stand up funnel/retention/UTM
insights; ship end-of-deck **email capture + share**; 301-fix the question URLs; rewrite
homepage meta + hreflang.
**Days 30–60 (repeat what worked):** run the next event with UTMs + on-site capture; ship the
"question/deck of the week" return hook; restore + localize question pages; add FAQ JSON-LD.
**Days 60–90 (compound + monetize):** build `/conversation-starters` hubs; launch one social
cadence using auto-generated cards; turn `/ai-at-work` into a B2B funnel and book the first
paid team session.

**The mission case:** every one of these levers is "help more people have a real conversation,
in their language, and come back to have another." Growth and mission are the same vector here.
The job is to stop the bucket leaking, then repeat the two things that already worked.
