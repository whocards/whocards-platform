# WhoCards — Analytics Baseline & Patterns

_Source: PostHog project "WhoCards" (EU, id 191293). Pulled 2026-06-23. All figures are
from live event data, not estimates. Where a number is derived or inferred it is marked._

> **The single most important fact:** product analytics only began capturing data around
> **2026-05-31**. Every "all-time" number below is really **~3.5 weeks** of data, and almost
> all of it comes from **one event activation**. Treat this as a _launch snapshot_, not a
> trend. There is no real historical baseline yet — which is itself the headline finding.

---

## 1. Headline numbers (2026-05-31 → 2026-06-23)

| Metric                            | Value                       | Notes                                                              |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| Total pageviews                   | **1,603**                   | 100% classified "Regular"/human; bot/AI-crawler traffic negligible |
| Unique visitors                   | **307**                     | `$pageview` unique users, the month                                |
| Device split                      | **270 mobile / 37 desktop** | **88% mobile**                                                     |
| Mobile app opens                  | **28**                      | native Expo app barely used yet                                    |
| Questions seen (event deck)       | **3,427**                   | legacy `event_question_seen`                                       |
| Question "next" taps (event deck) | **2,375**                   | legacy `event_question_next`                                       |
| Library deck opens                | **18**                      | generic `deck_opened`                                              |
| Games started (Library)           | **18**                      | generic `game_started`                                             |

## 2. Traffic shape — a spike that is decaying fast

Weekly pageviews:

| Week of    | Pageviews | WoW          |
| ---------- | --------- | ------------ |
| 2026-05-31 | 981       | launch       |
| 2026-06-07 | 483       | −51%         |
| 2026-06-14 | 122       | −75%         |
| 2026-06-21 | 17        | partial week |

This is a textbook **event spike with no retention loop** — roughly halving every week back
toward an organic floor near zero. The "leaky bucket" is the central growth problem.

## 3. Where it came from — one event, one country

**Geography (unique visitors):** Hungary **230 (~75%)**, United States 18, Germany 13,
Switzerland 11, Canada 5, China 5, UK 5, France 4, then a long tail.

**Referrers (pageviews):** `$direct` 1,113 (69%), `whocards.cc` 387 (internal nav),
`google.com` 60, `l.instagram.com` 16, `bluerebel.getlearnworlds.com` 5 (a partner course
site), **`chatgpt.com` 5**, `github.com` 4, Bing 3, Ecosia 3, Android Google search, Facebook,
LinkedIn.

**Top pages:**

| Path                                         | Pageviews                |
| -------------------------------------------- | ------------------------ |
| `/events/hajnalig/play`                      | 842                      |
| `/events/hajnalig`                           | 294                      |
| `/contact`                                   | **123**                  |
| `/` (home)                                   | 99                       |
| `/play` (Library)                            | 32                       |
| `/en/question/40` and other `/en/question/*` | ~3–10 each (legacy URLs) |
| `/print`                                     | 8                        |
| `/ai-at-work`                                | 6                        |

**Conclusion:** ~75% of all traffic and ~96% of all engagement is the **"Hajnalig" event**
(a Hungarian event, sponsored — note the Hello Parks / LearnWorlds partner referral). This was
a QR/link-driven, on-site, mobile activation. It worked extremely well _as an event_ and tells
us almost nothing yet about organic demand.

## 4. Engagement quality — the content works

The conference deck generated **3,427 question views and 2,375 "next" taps**. Against the
people who actually played, that is a very high questions-per-session — players went deep. The
product experience is sticky _within a session_. The problem is not the cards; it is
**distribution and return**.

By contrast the general **Library product is effectively pre-launch by usage**: 18 deck opens,
18 games, 13 `question_viewed`. Almost nobody reached the core consumer funnel — the event deck
is a separate bespoke page (`/events/hajnalig/play`) that bypasses it.

## 5. Language — 14 supported, 1 used

In-play language of questions seen: **Hungarian 3,293 (96%) vs English 134 (4%)**. Browser
languages: hu-HU 169, en-GB 60, en-US 43, de-DE 11, de-CH 4, fr-FR 4, ja 2…

The product supports **14 languages** (da, de, en, es, fr, he, hu, pl, pt, pt-br, ro, sr, zh,
jp) and 66 questions in the Pool. To date this multilingual surface is **almost entirely
unmonetized demand** — every non-Hungarian, non-English locale is greenfield.

## 6. Patterns that matter for growth

1. **Event-led, single-channel.** The only thing that has driven real usage is a live event.
   That is a _repeatable, proven channel_, not a fluke — but right now it is a one-off.
2. **No retention mechanism.** Nothing brings a player back: no account prompt, no email, no
   notification, no streak, no "new deck" reason. Traffic decays to zero between events.
3. **Activation cliff on the core product.** 307 visitors → 18 Library deck opens (~6%). The
   high-intent event audience never lands in the product that is meant to retain them.
4. **Mobile is the product (88%).** The web mobile experience — not the native app — is where
   users are. Native app (28 opens) is nascent.
5. **High intent for the physical/lead surface.** `/contact` was the **3rd most visited page
   (123)**; the homepage CTA funnels to "Request Cards." There is latent demand for cards /
   B2B contact that is currently captured only as raw form fills.
6. **Already AI- and search-discoverable.** Tiny but real traffic from `chatgpt.com`, Google,
   Bing, Ecosia, and legacy `/en/question/*` URLs — evidence the long-tail content surface has
   organic + AEO (answer-engine) potential that is currently untapped/broken (see SEO audit).

## 7. Instrumentation gaps to fix (so the next 3 weeks are measurable)

- **Event-name drift.** Legacy `event_question_*` (event decks) vs newer
  `question_viewed/next/shown`, `deck_opened`, `game_started`. Unify naming so the event deck
  and the Library report into one funnel — otherwise the conference's success is invisible to
  the core funnel metrics.
- **No funnel / retention insight saved.** There is no saved funnel (visit → deck_opened →
  game_started → N questions) and no retention/stickiness insight. Add these as the standing
  scoreboard before the next campaign.
- **No acquisition tagging.** Event links are `$direct`. Add UTMs to every QR/poster/partner
  link so the next event's contribution is attributable.
- **No identified users / no email join key.** Without an identity or email capture there is no
  way to measure or build retention. This is the highest-leverage instrumentation+product gap.

See `02-seo-audit.md` for the discoverability audit and `03-growth-strategy.md` for the
strategy and projections that build on these patterns.
