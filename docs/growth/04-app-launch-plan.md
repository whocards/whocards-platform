# WhoCards — Mobile App Launch Plan

_The concrete launch playbook for the first WhoCards mobile release. **iOS ships first** (it is
approved and is the public download today); **Android follows** after Google's mandatory 12-tester /
14-day Closed Test and production-access review. Sits on top of
[`03-growth-strategy.md`](./03-growth-strategy.md) (which says **fix retention first**) and turns the
app launch into the moment we actually start keeping people. 2026-06-24; split-launch update
2026-06-27._

> **Why the launch is split.** We originally planned to hold iOS until Android could ship the same
> day. iOS is now approved while Android is a minimum of ~14 days out and does not yet have its 12
> testers. Holding a finished, approved iOS build hostage to Android's testing gate buys nothing and
> costs weeks of retention. So iOS goes public now; Android visitors are routed into the Closed Test
> at `/android-testers` until Google grants production access, at which point the second store flips
> on with no further code change.

> **One-line thesis.** The app launch is not a traffic event — it is our first real chance to
> convert anonymous web players and an event spike into an **owned, re-engageable audience**.
> Every choice below is graded on "does this build a list we can talk to again, and a reason for
> them to open the app next week," not on launch-day download count alone.

**Tracking:** [#99](https://github.com/whocards/whocards-platform/issues/99) owns the finite,
ordered v1.0 release. [#85](https://github.com/whocards/whocards-platform/issues/85) owns the
audience, Campaign launch, and post-launch growth workstream.

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

## 2. Decision: how do we tell people? (buildup + launch notification)

The campaign has two distinct sends:

1. **Pre-launch buildup:** publish `/app` and invite the existing, consented
   newsletter audience to follow the app's progress. New app-notification signups only join the
   buildup when they also check the optional newsletter box. Use the buildup to raise engagement
   before asking for a download.
2. **Campaign launch (iOS):** once the iOS App Store listing is live and verified, send the
   dedicated launch announcement to the app-notification list and the newsletter audience, segmented
   by source and deduplicated. Copy says WhoCards is on iOS today and Android is coming — Android
   readers get a one-line "want to help us get there sooner?" link to `/android-testers`.
3. **Android-available send:** a smaller second announcement when `PUBLIC_APP_ANDROID_LAUNCHED`
   flips (Google grants production access and the Play listing is public). Prioritise the testers
   and the Android segment; do not re-blast iOS users who already installed.

The channel portfolio is ranked by ROI:

| Channel                                                                                         | Reach                | Cost       | Verdict                                                                                                              |
| ----------------------------------------------------------------------------------------------- | -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| **Email to consented newsletter subscribers** (+ **app-notification list** for the launch send) | Warm, owned          | Free       | **Primary.** Highest-intent audience we have; deduplicate people present in both Segments.                           |
| **Smart App Banner + site CTA** (whocards.cc → /app)                                            | All web-play traffic | Free       | **Primary.** Converts existing in-product attention. iOS `apple-itunes-app` meta tag; Android native-app deep links. |
| **Social posts** (LinkedIn / Facebook / Instagram — accounts already exist)                     | Cold-ish             | Free       | **Yes.** Reuse auto-generated question cards as creative (§ ties to #56).                                            |
| **In-app web→app handoff** (banner inside `/play`)                                              | Engaged players      | Free       | **Yes.** Catch people at peak engagement.                                                                            |
| **Web push**                                                                                    | Opted-in web users   | Setup cost | **Defer.** Not set up; not worth blocking launch.                                                                    |
| **Paid ads**                                                                                    | Cold, broad          | $$         | **Defer.** Strategy says organic-first until retention is proven.                                                    |

**Why owned-first:** per `01-analytics-baseline.md`, traffic is bursty and ~0% returns. A paid
push into a leaky bucket is wasted. Email + on-site banner reach the people most likely to install
and stick, for free.

**The launch email** is a dedicated React Email template in `@whocards/emails` ("It's live —
WhoCards is in your pocket"), segment-able by source so we can tailor copy (waitlist vs. existing
newsletter subscriber vs. cards customer vs. AI-at-work lead). It depends on the `apps/emails`
package (PR #84 / #82). It is not the pre-launch buildup email.

### General audience email cadence (event-triggered, not calendar-triggered)

1. **Waitlist live — “we're building this with you.”** Send to newsletter subscribers when the
   pre-launch signup banner and `/app` are live. Show the app preview and the reason for building
   it; ask for a reply about where they would use WhoCards. Primary goal: conversation and signal,
   not downloads.
2. **Beta validated — “almost ready.”** Send after the release candidate passes the beta exit
   gate, including Google's mandatory 12-testers-for-14-continuous-days Closed Testing gate.
   Share one Question and a behind-the-scenes detail; invite people to play it now and forward it
   to someone. Primary goal: engagement and anticipation.
3. **Campaign launch — “it's live on iOS.”** Send once the iOS App Store listing and its URL are
   verified. App-notification subscribers receive this send even without newsletter consent;
   newsletter subscribers receive it as a product update; deduplicate contacts in both Segments.
   The Android line points at `/android-testers`, not a store.
4. **Android-available — “now on Android too.”** A separate, smaller send when Android goes public.
   Lead with the tester cohort and Android subscribers; don't re-announce to iOS users.

Do not use a date-based countdown until store review is complete. Store delays should postpone the
next send, not turn “coming this week” into an apology email. The same rule applies to Android: its
availability send waits for `PUBLIC_APP_ANDROID_LAUNCHED`, never a guessed date.

### Android tester email journey

The mandatory Closed Test is a separate engagement journey, not a footnote inside the general
buildup email:

1. **Recruitment — “help unlock the Android launch.”** Send the dedicated #82 template once both
   the tester Google Group URL and the Play Closed Testing opt-in URL exist. Send it to the consented newsletter audience and support
   it with personal outreach; invite forwarding to Android friends. Link to a dedicated
   `/android-testers` instruction page rather than the public `/app` funnel, because testers are
   joining a beta cohort, not asking for the public launch notification. Start with the fewest
   possible interactions: clear steps and direct links to join the tester Google Group and Play
   Closed Test. Add a form, newsletter checkbox, or invite-only gate later only if recruitment needs
   more control. Recruit 18–20 people into one Google Group so at least 12 remain continuously
   opted in.
2. **Onboarding — “your testing mission.”** After each tester joins, send the opt-in/install steps
   plus a short mission: first play, swipe, change language, share, background/reopen, and report
   one confusing or delightful moment.
3. **Midpoint check-in.** Around day 7, thank the cohort, share what has changed, and ask one focused
   feedback question. This keeps the cohort active and produces evidence for Google's
   production-access questionnaire.
4. **Completion.** After the continuous 14-day gate, thank testers, tell them the production
   application is submitted, and keep them as the first feedback cohort for future releases.

If a tester form is added later, tester signups should grant a dedicated `android_beta_test`
consent, not `app_launch`. The tester signup can offer the same optional, unchecked newsletter
checkbox used elsewhere, but tester consent and newsletter consent must remain separate rows. For
the first page, there is no form and therefore no newsletter consent capture. Tester lifecycle
emails go only to the tester cohort; they do not count as the general newsletter buildup sequence.

---

## 3. Decision: the page (`/app`)

A dedicated **`/app`** download landing page (linked from the homepage hero and nav), not just
badges bolted onto the homepage. Rationale: one page we can point every channel at, A/B and
instrument cleanly, and flip between two modes with a single switch.

**`/app` behind `APP_VISIBLE`** — gated by two per-store flags: `PUBLIC_APP_IOS_LAUNCHED` (default
**on** — iOS is public) and `PUBLIC_APP_ANDROID_LAUNCHED` (default **off** — Android is in Closed
Testing). `/app` is visible whenever either store is live (both off → redirects home). It renders
one **download mode**: store **tiles** front-and-centre, **device-aware ordering** that leads with
the visitor's own platform. iOS is a real App Store download. Android is a real Play download **once
`PUBLIC_APP_ANDROID_LAUNCHED` flips**; until then the Android tile reads "Android · in testing →
Become a tester" and routes to `/android-testers` instead of a dead Play badge. An inbox fallback
("send the download link to your computer") stays as a desktop affordance and is the email-capture
surface. (The earlier pre-launch waitlist mode was removed once iOS shipped — it was unreachable
with a store permanently live.)

**Options considered & rejected:**

- _Badges on homepage only_ — no instrumentable funnel, no waitlist surface, clutters the hero.
  (We still add a homepage CTA → `/app`.)
- _Separate pre-launch and post-launch pages_ — two URLs to migrate, loses accrued SEO/links.
  One page that flips wins.

**Why one page, two platform states:** a single instrumentable funnel carries both platforms and
detects the visitor's device rather than hardcoding one store. The Android tile changes shape based
on `PUBLIC_APP_ANDROID_LAUNCHED` (Closed Test funnel → real Play badge) with no page rewrite.

**Split-release rule:** iOS is approved and public now (`PUBLIC_APP_IOS_LAUNCHED=true`). Do **not**
hold it for Android. Android runs its mandatory Closed Test in parallel; while it does, `/app` and
the tester emails send Android visitors to `/android-testers`. The moment Google grants production
access and the Play listing is live, flip `PUBLIC_APP_ANDROID_LAUNCHED=true` — the Android tile
becomes a real download and the second-platform announcement can go out. Two launch moments, one
page, no broken badge in between.

---

## 4. Decision: app notification + permanent newsletter signup

Do not treat an app-launch notification and an ongoing newsletter as the same consent. The website
has two explicit signup paths:

- **Pre-launch signup banner:** email capture for the one-time app launch notification. It includes
  a separate, optional, unchecked checkbox for occasional WhoCards newsletters. This is distinct
  from Apple's post-release **Smart App Banner**.
- **Permanent footer signup:** a sitewide newsletter form for occasional questions, product news,
  and future releases. This remains after the launch campaign ends.
- **Additional capture:** an end-of-deck nudge (ties to existing #51) can offer the same newsletter
  signup at a proven moment of engagement.
- **Consent:** persist app-notification and newsletter consent separately. App-only subscribers get
  the confirmation and public-download notification; only newsletter subscribers receive the
  pre-launch buildup and ongoing engagement emails.
- **Source tagging:** every signup carries its acquisition source (e.g. `app-waitlist`, or the
  `utm_source` for campaign traffic) on the PostHog event for segmentation. The DB stores only the
  canonical `consent_source` (`app_page`); per-signup source persistence is tracked in #92, so don't
  treat `source` as a stored column today.
- **Confirmation email:** immediate "You're on the list" with copy that reflects the selected
  consent and a soft ask to add `hello@whocards.cc` to contacts.
- **Delivery and preferences:** Postgres remains the consent record. Sync consented contacts to
  Resend Contacts using separate `newsletter` and `app-waitlist` Segments; use a newsletter/product
  updates Topic for user-visible preferences. Send marketing through Resend Broadcasts so
  unsubscribe, suppression, batching, and campaign reporting are handled before any buildup send.
  Application behavior is #87; production configuration/backfill/round-trip verification is #97.
- **Free-tier constraint:** stay within Resend's free Marketing plan (currently 1,000 contacts,
  three Segments, and unlimited Broadcast sending). The current consented newsletter audience is
  30 contacts, leaving ample launch headroom.

---

## 5. Decision: getting reviews & ratings (the ASO flywheel)

Ratings are the compounding ASO asset. Ranked by leverage:

1. **Ship `expo-store-review` in the v1 binary.** It is a native dependency, so it must land before
   the release candidate enters the 14-day Closed Test. Trigger the standardized native prompt
   directly after a proven moment of value: at least 10 answered Cards across at least two
   sessions, after play rather than mid-Card. Attempt at most once per app version and respect the
   OS quota.
2. **No soft-ask or review gating.** Apple disallows custom review prompts, and Expo explicitly
   says not to ask a question before presenting the native review UI. Feedback/contact remains
   always available as a separate support path; it is not selected based on whether someone says
   they are happy.
3. **Measure requests, not outcomes.** `StoreReview.requestReview()` returns no submission result,
   and the OS may decline to show the prompt. Track eligibility and request attempts
   (`app_review_eligible`, `app_review_requested`), never a fictional “accepted” event.
4. **Testing:** verify the flow on Android through the Play test track. On iOS,
   `StoreReview.isAvailableAsync()` is false under TestFlight, so unit-test the eligibility gate
   and verify the native prompt only after App Store distribution.

**Anti-patterns to avoid:** prompting on launch, prompting every session, prompting before the
player has felt the value, adding a custom pre-prompt, or claiming to know whether a rating was
submitted.

---

## 6. Decision: keep them engaged for future releases (the roadmap)

The launch is release #1 of many. The engagement engine is mostly **already ticketed** — this
plan threads them into a release cadence rather than reinventing them:

- **Push notifications for conversation prompts** — Epic **#71**. The core re-engagement engine;
  a daily/weekly prompt is the reason to re-open. Sequenced as Phase 5 (post-launch).
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

| Step            | Event                                          | Notes                                             |
| --------------- | ---------------------------------------------- | ------------------------------------------------- |
| Page view       | `app_page_viewed`                              | with detected platform                            |
| Waitlist signup | `app_waitlist_signup`                          | **with `source`**                                 |
| Store click     | `app_store_clicked`                            | `store: ios \| android`, UTM on the outbound link |
| Install         | (attribution)                                  | store-console + UTM; best-effort                  |
| First play      | existing play/answer events                    | activation                                        |
| Review prompt   | `app_review_eligible` / `app_review_requested` | native request only; outcome is not observable    |

Put **UTM params on every store link** so installs are attributable to channel. Stand up a small
**launch scoreboard** (page→signup→click rates, signup-by-source) — without it we can't tell which
channel earned the installs.

---

## 8. Phased roadmap

| Phase                                | When           | Ships                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Pre-launch** _(done)_          | before iOS     | Merged the campaign code; published the app-notification banner and `/app` (waitlist mode pre-iOS-launch, now iOS download mode) with optional newsletter consent; permanent footer newsletter signup; invited the existing newsletter audience into the buildup; capture + confirm new subscribers; Resend Segments/Topic (#87/#97); source tagging and instrumentation; store-listing copy + screenshots (#17/#34); ASO keywords; Smart App Banner prep. **Built and warmed the list.** |
| **1 — iOS public + quiet soak**      | now (approved) | iOS is approved: release it. Promote the validated iOS binary to the App Store, flip `PUBLIC_APP_IOS_LAUNCHED=true`, and run a ~24-hour quiet soak. Verify the listing, App Store badge/deep links, Smart App Banner, PostHog, Answer recording, and support. No unresolved P0/P1 issue. **Do not wait for Android.**                                                                                                                                                                     |
| **2 — iOS campaign launch**          | after soak     | `/app` is in **download mode** (iOS tile = real download; Android tile = "Become a tester" → `/android-testers`); send the **iOS launch announcement** (segmented); social posts; homepage + `/play` CTAs.                                                                                                                                                                                                                                                                                |
| **3 — Android Closed Test → public** | ~14+ days      | In parallel with 1–2: recruit 18–20 Android testers so 12 remain continuously opted in for 14 days; run the release/device gates; fix feedback; apply for Google production access and allow up to 7 more days (#98). When granted and the Play listing is live, flip `PUBLIC_APP_ANDROID_LAUNCHED=true` (Android tile becomes a real download) and send the smaller **Android-available** announcement.                                                                                  |
| **4 — Post-launch (wk 1–4)**         | after          | Monitor the **native in-app review prompt** eligibility/request rate; launch funnel/scoreboard (#54), including the `android_tester_clicked` step; fix the largest activation friction.                                                                                                                                                                                                                                                                                                   |
| **5 — Engagement cadence**           | ongoing        | push prompts (#71); question/deck of the week (#52/#56); share card (#76/#53); what's-new per release.                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 9. What this plan built (code, merged)

The vertical slice that landed before the iOS public release, with `/app` first in waitlist mode to
build the audience and now in iOS download mode:

- **`/app` download/launch landing page** — per-platform flags (`PUBLIC_APP_IOS_LAUNCHED` /
  `PUBLIC_APP_ANDROID_LAUNCHED`); device-aware tiles; iOS real download, Android routed to
  `/android-testers` until its store flag flips.
- **App-notification capture + confirmation email** — separate one-time app notification from
  optional newsletter consent; source-tagged and projected to Resend through #87/#97.
- **Campaign launch announcement email template** — branded React Email in `@whocards/emails` (lands
  once PR #84 puts that package on `main`).
- **In-app review prompt** — policy-compliant direct `expo-store-review` request after the
  eligibility threshold; must land in the v1 binary before Closed Testing.

Tracked as the ordered **first mobile release** epic #99 and the related audience/growth epic #85.

---

## 10. Existing tickets this plan threads together

#71 (push), #54 (funnel/scoreboard), #51 (end-of-deck capture), #52 (return hook), #56 (social
QOTD), #50 (reposition landing), #53/#76 (share card), #17 (store listing/compliance), #34 (store
screenshots), #82/#84 (tester recruitment + emails package). New issues created by this plan are
listed in the epic, including #96 (buildup + tester lifecycle emails), #97 (production Resend
audience), and #98 (Android Closed Test + production access). The complete dependency order lives
in #99.
