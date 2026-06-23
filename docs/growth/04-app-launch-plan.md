# WhoCards — Mobile App Launch Plan

_The concrete launch playbook for the first WhoCards mobile release (iOS + Android together).
Sits on top of [`03-growth-strategy.md`](./03-growth-strategy.md) (which says **fix retention
first**) and turns the app launch into the moment we actually start keeping people. 2026-06-24._

> **One-line thesis.** The app launch is not a traffic event — it is our first real chance to
> convert anonymous web players and an event spike into an **owned, re-engageable audience**.
> Every choice below is graded on "does this build a list we can talk to again, and a reason for
> them to open the app next week," not on launch-day download count alone.

---

## 0. Where the app launch sits in the existing strategy

`03-growth-strategy.md` is blunt: **acquisition works in bursts, nothing is retained; fix the
leaky bucket before spending on acquisition.** A mobile app is the strongest retention surface we
have (home-screen presence, push, offline play). So the launch is sequenced to serve retention:

1. capture an **owned audience** _before_ launch (waitlist), so launch day is a warm send, not a
   cold start;
2. give every installer a fast path to **first play** (activation) and then **ask for a review**
   at a happy moment;
3. wire **re-engagement** (push prompts, what's-new) so release #2 is a re-activation event, not
   another standing start.

This plan does **not** restate the five growth levers — it executes the app-shaped slice of them.

---

## 1. The launch funnel (what we are optimizing)

```
Reach ─▶ /app page ─▶ Waitlist signup ─▶ Store badge click ─▶ Install
                                                                  │
                                              First play (ACTIVATION)
                                                                  │
                                          Rating / Review  ◀── happy-moment prompt
                                                                  │
                                              Retention ─▶ Re-engagement (push / what's-new)
```

Each arrow is an instrumented step (§7). The two arrows that matter most are **Install → First
play** (activation) and **First play → Review** (ASO flywheel). A download with no first play and
no review is a vanity number.

---

## 2. Decision: how do we tell people? (launch notification)

The "notification" is a **portfolio of owned channels**, fired on launch day. Ranked by ROI:

| Channel                                                                                           | Reach                | Cost       | Verdict                                                                                                              |
| ------------------------------------------------------------------------------------------------- | -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| **Email blast to our list** (cards requesters + newsletter + AI-at-work leads + **app waitlist**) | Warm, owned          | Free       | **Primary.** Highest-intent audience we have.                                                                        |
| **Smart App Banner + site CTA** (whocards.cc → /app)                                              | All web-play traffic | Free       | **Primary.** Converts existing in-product attention. iOS `apple-itunes-app` meta tag; Android native-app deep links. |
| **Social posts** (LinkedIn / Facebook / Instagram — accounts already exist)                       | Cold-ish             | Free       | **Yes.** Reuse auto-generated question cards as creative (§ ties to #56).                                            |
| **In-app web→app handoff** (banner inside `/play`)                                                | Engaged players      | Free       | **Yes.** Catch people at peak engagement.                                                                            |
| **Web push**                                                                                      | Opted-in web users   | Setup cost | **Defer.** Not set up; not worth blocking launch.                                                                    |
| **Paid ads**                                                                                      | Cold, broad          | $$         | **Defer.** Strategy says organic-first until retention is proven.                                                    |

**Why owned-first:** per `01-analytics-baseline.md`, traffic is bursty and ~0% returns. A paid
push into a leaky bucket is wasted. Email + on-site banner reach the people most likely to install
and stick, for free.

**The launch-day email** is a dedicated React Email template in `@whocards/emails` ("It's live —
WhoCards is in your pocket"), segment-able by source so we can tailor copy (waitlist vs. cards
customer vs. AI-at-work lead). It depends on the `apps/emails` package (PR #84 / #82).

---

## 3. Decision: the page (`/app`)

A dedicated **`/app`** download landing page (linked from the homepage hero and nav), not just
badges bolted onto the homepage. Rationale: one page we can point every channel at, A/B and
instrument cleanly, and flip between two modes with a single switch.

**Two modes, one date-driven flip** (`PUBLIC_APP_LAUNCHED` / a launch date constant):

- **Pre-launch (waitlist mode):** hero + value prop + screenshots + **"Notify me when it's
  live"** email capture. Builds the owned audience the launch email needs.
- **Launch mode:** same page, store **badges** front-and-center, **device-aware ordering** (iOS
  visitor sees the App Store badge first, Android sees Google Play first — detected from UA),
  waitlist demoted to a "not on your phone? we'll remind you" fallback.

**Options considered & rejected:**

- _Badges on homepage only_ — no instrumentable funnel, no waitlist surface, clutters the hero.
  (We still add a homepage CTA → `/app`.)
- _Separate pre-launch and post-launch pages_ — two URLs to migrate, loses accrued SEO/links.
  One page that flips wins.

**Why both stores at once:** confirmed launch posture is iOS + Android together, so the page must
carry both badges and detect platform rather than hardcode one store.

---

## 4. Decision: email capture (the waitlist)

Reuse the proven website pattern (`apps/website/src/pages/api/ai-checkin-subscribe.ts`:
`insertUser({newsletter:true})` + a Resend confirmation), **not** a new bespoke system.

- **Where:** primary on `/app`; secondary nudge at end-of-deck (ties to existing #51) and a
  homepage CTA. Capture is email-only (lowest friction) with optional name.
- **Source tagging:** every signup is tagged with its source (e.g. `app-waitlist`) via a PostHog
  event and, where possible, persisted, so the launch blast can segment. _This is the single most
  important detail_ — an untagged list can't be segmented and the launch email becomes generic.
- **Confirmation email:** immediate "You're on the list" with what to expect + a soft ask to add
  `hello@whocards.cc` to contacts (deliverability). Inline-HTML in the API route, consistent with
  the AI-checkin endpoint (no new infra), until `@whocards/emails` is on `main`, then it can move
  to a branded template.
- **Consent/unsubscribe:** the list is reused for marketing, so the production launch blast must
  carry an unsubscribe + honor suppression (the emails-package README already flags this as a
  pre-campaign requirement — do not skip).

---

## 5. Decision: getting reviews & ratings (the ASO flywheel)

Ratings are the compounding ASO asset. Ranked by leverage:

1. **Native in-app review prompt** (`expo-store-review` / StoreReview). Trigger at a **proven-happy
   moment** — e.g. after the player has answered N cards across ≥2 sessions — never on first open,
   never mid-play. Respect the OS quota (the system shows it sparingly). **Highest leverage; build
   it.**
2. **Soft-ask gate** in front of the native prompt: "Enjoying WhoCards?" → 👍 routes to the store
   review, 👎 routes to a feedback capture (email/`/contact`). Protects the public rating; sends
   unhappy signal somewhere useful.
3. **Review-ask email** a few days post-install (for installers we can email). Secondary.

**Anti-patterns to avoid:** prompting on launch, prompting every session, prompting before the
player has felt the value, or routing unhappy users straight to a public review box.

---

## 6. Decision: keep them engaged for future releases (the roadmap)

The launch is release #1 of many. The engagement engine is mostly **already ticketed** — this
plan threads them into a release cadence rather than reinventing them:

- **Push notifications for conversation prompts** — Epic **#71**. The core re-engagement engine;
  a daily/weekly prompt is the reason to re-open. Sequenced as Phase 3 (post-launch).
- **Question / deck of the week** return hook — **#52**, and social **#56** (question-of-the-day
  using auto-generated cards). Cross-channel re-engagement.
- **Share a question card** — mobile **#76** + web **#53**: retention _and_ acquisition (viral
  loop) in one action.
- **"What's new" on each release** — surface release notes in-app + a public changelog, so every
  update is a small re-activation moment. (New ticket below.)
- **Unified growth funnel / scoreboard** — **#54**: one PostHog funnel + retention/UTM dashboard;
  this plan's §7 funnel feeds it.

**Release cadence principle:** every future release ships with (a) a what's-new screen, (b) a
push/email re-activation to the owned list, and (c) one new reason-to-return. The launch builds
the list; the cadence keeps it.

---

## 7. Measurement (instrument before launch, not after)

One funnel in PostHog (feeds **#54**), every step a named event:

| Step            | Event                                         | Notes                                             |
| --------------- | --------------------------------------------- | ------------------------------------------------- |
| Page view       | `app_page_viewed`                             | with detected platform                            |
| Waitlist signup | `app_waitlist_signup`                         | **with `source`**                                 |
| Store click     | `app_store_clicked`                           | `store: ios \| android`, UTM on the outbound link |
| Install         | (attribution)                                 | store-console + UTM; best-effort                  |
| First play      | existing play/answer events                   | activation                                        |
| Review prompt   | `app_review_prompted` / `app_review_accepted` | soft-ask + native                                 |

Put **UTM params on every store link** so installs are attributable to channel. Stand up a small
**launch scoreboard** (page→signup→click rates, signup-by-source) — without it we can't tell which
channel earned the installs.

---

## 8. Phased roadmap

| Phase                        | When    | Ships                                                                                                                                                                                                      |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Pre-launch**           | now     | `/app` page in **waitlist mode**, waitlist capture + confirmation email, source tagging, instrumentation; store-listing copy + screenshots (#17/#34); ASO keywords; smart-banner prep. **Build the list.** |
| **1 — Launch day**           | release | flip `/app` to **download mode**; **launch-day email blast** (segmented); social posts; homepage + `/play` CTAs; smart app banner live.                                                                    |
| **2 — Post-launch (wk 1–4)** | after   | **in-app review prompt** (soft-ask + native); review-ask email; launch funnel/scoreboard (#54); fix top activation friction.                                                                               |
| **3 — Engagement cadence**   | ongoing | push prompts (#71); question/deck of the week (#52/#56); share card (#76/#53); what's-new per release.                                                                                                     |

---

## 9. What is being built now (code, behind review, **not merged until after release**)

This plan ships with a vertical slice so Phase 0 is real, not just words:

- **`/app` download/launch landing page** — waitlist mode now, launch mode flag-ready, device-aware
  store badges.
- **Waitlist capture API + confirmation email** — `insertUser` + Resend, source-tagged, following
  the AI-checkin pattern.
- **Launch-day announcement email template** — branded React Email in `@whocards/emails` (lands
  once PR #84 puts that package on `main`).
- **In-app review prompt** — soft-ask gate + `expo-store-review` on mobile (Phase 2 slice).

Tracked as the **"App launch + growth"** epic and its child issues (see the issue tracker).

---

## 10. Existing tickets this plan threads together

#71 (push), #54 (funnel/scoreboard), #51 (end-of-deck capture), #52 (return hook), #56 (social
QOTD), #50 (reposition landing), #53/#76 (share card), #17 (store listing/compliance), #34 (store
screenshots), #82/#84 (tester recruitment + emails package). New issues created by this plan are
listed in the epic.
