# Video-call plugins — Phase 1 research

**Status:** research complete, no build started. Feeds epic #180.
**Related:** sibling epic #179 (messaging-platform bots) has not yet produced a research doc as of this writing (no PR found against it) — nothing to cross-reference yet. The two are likely to share an architecture pattern (a thin hosted web surface + per-platform manifest/SDK shim); whoever writes #179's doc should check back against this one.

## The question this feeds

Should WhoCards build an in-call surface so a host can show a question to every participant of a Zoom/Meet/Teams/Discord call **without screen sharing**, and if so, which platform first and roughly what shape? This doc does not decide; it hands the owner a comparison and a recommendation to approve or override.

## TL;DR recommendation

Build **Zoom first**, as a Zoom App running in every participant's own panel (not "Collaborate Mode"), synced by the SDK's built-in `sendMessage`/`postMessage` broadcast — host action broadcasts `{questionId, deckSlug, language}` to all open app instances, no new realtime infrastructure required. Back it with one new tiny tRPC-callable session table on the existing Netlify+Postgres stack purely so a **late joiner** can fetch current state (the broadcast itself is fire-and-forget, not durable). Reuse `packages/decks/src/engine` untouched for the draw logic and a purpose-built minimal view (not the full `/play` page) for the card. Confidence: **medium** — high confidence on the Zoom mechanics (documented, GA, no gate), lower confidence on marketplace review time and on whether "everyone opens their own panel" (rather than one shared surface) feels natural enough at a real table to pass the soul test. **Recommend validating with an unlisted/dev-mode Zoom App in a real WhoCards team call before committing to marketplace submission.**

Do **not** start with Google Meet: its only first-party low-latency shared-state primitive, the Co-Doing API, is a closed early-access program as of this research (mid-2026) — Meet would require building the exact same custom sync backend as everyone else, with none of Zoom's "batteries included" pub-sub, for a platform whose add-on ecosystem is also newer and less proven. Revisit Meet once Co-Doing (or an equivalent) reopens.

---

## 1. Shared-state model per platform (the make-or-break question)

This is the part that decides whether "host draws, everyone sees the same card" is a few lines against a platform SDK or a bespoke realtime service WhoCards has to build and operate.

### (a) Zoom Apps — real shared pub/sub, generally available

Zoom Apps run as an iframe inside the Zoom client. Two relevant models:

- **Collaborate Mode**: an explicit "bring everyone into the same session" mode (`startCollaborate()`/`joinCollaborate()`/`onCollaborateChange()`). It hands your app a **Collaborate UUID** shared by every participant who joins, but Zoom does **not** sync any state for you — the docs are explicit that the app must fetch/store state from its own backend keyed by that UUID, and must handle late joiners landing on the current state itself. Enabling it requires a toggle in the app build flow and **triggers re-review**. ([Zoom Collaborate Mode docs](https://developers.zoom.us/docs/zoom-apps/guides/collaborate-mode/))
- **`sendMessage`/`postMessage`** (core `@zoom/appssdk`, no Collaborate Mode needed): `sendMessage` "triggers a broadcast of JSON message data to instances of the same app for all participants in a meeting" who have the app open; `postMessage` sync's an instance's current state, capped at <512KB. This is a real, low-latency, first-party pub/sub across every open app instance in the meeting — closer to what "host draws, everyone sees" actually needs, and it ships in the base SDK (no gated program, no extra review toggle). ([`@zoom/appssdk` reference](https://appssdk.zoom.us/classes/ZoomSdk.ZoomSdk.html))

Neither mechanism is durable: a participant who opens the app mid-meeting has missed prior broadcasts. That means WhoCards still needs a tiny bit of its own backend state — not for the realtime fan-out (Zoom does that), but purely so a late joiner's client can ask "what's the current card?" once on open. This is a read-mostly, low-write, low-durability need — a good fit for the existing Postgres+Drizzle stack, not a new realtime service.

Host-control flow in practice: only the host's client calls `sendMessage`; participant clients are passive listeners that render whatever they're sent. No participant, host-only guard is provided by the SDK itself — WhoCards' own app code decides which client is "the host" (Zoom's context object exposes participant/host role) and only shows Next/Pick controls to that role.

### (b) Google Meet add-ons — GA embedding, but the real-time sync layer is a closed program

The Meet Add-ons SDK itself (main stage + side panel, `createAddonSession`, `startActivity()`) reached general availability in 2024/2025 and is not gated. ([GA announcement](https://workspaceupdates.googleblog.com/2024/09/google-meet-add-ons-sdk-is-now-available.html), [overview](https://developers.google.com/workspace/meet/add-ons/guides/overview))

`startActivity()` takes an `additionalData` payload that's handed to every participant **once**, at the moment they join the activity (`getActivityStartingState()` on the joining side) — a one-shot initial-state handoff, not ongoing sync. For actual ongoing sync while the activity runs, Google's own collaboration guide names exactly two options: "handle it yourself by authoring your own synchronization backend," or the **Co-Doing API** (`createCoDoingClient`, `broadcastStateUpdate`, `onCoDoingStateChanged`). ([Collaborate guide](https://developers.google.com/workspace/meet/add-ons/guides/collaborate-in-the-add-on), [Co-Doing API guide](https://developers.google.com/workspace/meet/add-ons/guides/use-CoDoingAPI))

**The surprise**: as fetched directly from Google's current docs during this research, the Co-Doing API page states plainly — _"This program is now closed to new signups."_ Its sibling, the Co-Watching API, carries the identical notice. So the one first-party primitive that would give Meet the same "batteries included" broadcast Zoom has for free is currently unavailable to a new integrator. A Meet build today means Google's own fallback: bring your own sync backend, no different in effort from Discord.

### (c) Microsoft Teams meeting apps — the most turnkey of the four, if WhoCards ever targets Teams

Live Share (`@microsoft/live-share`) is a purpose-built SDK for exactly this pattern: it wraps a free, Microsoft-managed Azure Fluid Relay session per meeting and exposes ready-made distributed data types — `LiveState` (a synced JSON blob, ideal for "current question"), `LivePresence`, `LiveEvent`, and notably **`LiveFollowMode`**, whose entire purpose is "presenter controls what's shown, others follow, with a `LiveFollowMode.startPresenting()`/stop-following affordance" — almost exactly the host/participant relationship WhoCards needs, built in rather than hand-rolled. It requires _zero_ custom backend: "Live Share is designed to transform Teams apps into collaborative multi-user experiences without writing any dedicated back-end code." The `meetingStage` frame context is explicitly the "no screen share, embedded in the call surface" placement. Caveat: session data in the free hosted relay is retained only ~24h, which is irrelevant for a live "what card is up right now" use case but means it's not a source of truth — durable state (answer/analytics) still needs WhoCards' own backend, same as elsewhere. ([Live Share overview](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/teams-live-share-overview))

Given how directly this fits the ask, Teams is arguably the _technically_ easiest of the four — the reason it isn't the top recommendation is audience fit (see §4), not capability.

### (d) Discord Activities — no first-party sync at all; bring your own multiplayer

The Embedded App SDK is a thin bridge (voice-channel/DM iframe, participant/session context, URL-based invites) with **no built-in shared-state primitive**. Every source surveyed points developers at third-party or self-hosted multiplayer backends — Colyseus (self-hosted authoritative server) or Playroom Kit (hosted realtime rooms) are the two patterns actually used in production Discord Activities today. ([SDK repo](https://github.com/discord/embedded-app-sdk), [Colyseus + Discord](https://colyseus.io/blog/discord-embedded-sdk/), [Playroom Kit + Discord](https://docs.joinplayroom.com/components/discord)) This means Discord costs the same backend-build effort as Meet or a from-scratch build, for an audience (§4) that is the worst fit for the work-deck strategy this epic is meant to serve.

### Summary table

| Platform            | Native shared-state primitive                                  | Ongoing sync built in?                      | Gated/closed?       | Who builds the "everyone sees the same card" wiring   |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------- | ------------------- | ----------------------------------------------------- |
| Zoom Apps           | `sendMessage`/`postMessage` broadcast (core SDK)               | Yes — real pub/sub                          | No, GA              | Mostly Zoom; WhoCards owns late-joiner hydration only |
| Google Meet add-ons | Co-Doing API                                                   | Would be yes, but **closed to new signups** | **Yes, closed EAP** | WhoCards, in full                                     |
| Teams meeting apps  | Live Share (`LiveState`/`LiveFollowMode` on Azure Fluid Relay) | Yes — real sync, free managed relay         | No                  | Mostly Microsoft; WhoCards owns almost nothing        |
| Discord Activities  | none                                                           | No                                          | N/A                 | WhoCards, in full (or a third-party like Colyseus)    |

---

## 2. Review/marketplace, hosting, compliance, cost

- **Zoom App Marketplace**: functional review + a security review stage (technical design doc, OAuth-scope justification, OWASP-style checks) with a **72-hour SLA per queue step**, Mon–Fri Pacific business hours; total time to first publish is commonly reported as low-single-digit weeks if the submission is clean. No listing fee. Requires a privacy policy describing what the app collects. ([App review process](https://developers.zoom.us/docs/distribute/app-review-process/), [review guidelines](https://developers.zoom.us/docs/distribute/app-review-guidelines/))
- **Google Workspace Marketplace**: two separate gates — **OAuth verification** by Google Trust & Safety (documented cases of 4+ weeks with sparse feedback) and a **separate manual Marketplace listing review** (branding, consent screen, scope-consistency checks) that can add further days-to-weeks. No listing fee, but this is the slowest and least predictable of the four reviewed. ([about app review](https://developers.google.com/workspace/marketplace/about-app-review), [OAuth verification pain reports](https://security.googlecloudcommunity.com/security-validation-5/oauth-verification-for-workspace-add-on-stuck-for-8-weeks-client-critical-6543))
- **Teams (meeting apps)**: standard Teams Store submission/validation via Partner Center; an org can also sideload/custom-app a meeting app to itself with no store review at all, which is a fast path for an internal pilot but doesn't reach discovery.
- **Discord Activities**: an Activity can run privately in a server without appearing in Discord's App Directory; directory listing adds a content/policy review. Lightest-weight platform to _try_, heaviest to build the actual sync for (§1d).

None of the four charge a marketplace fee to list; all require a hosted privacy policy and (Zoom, Google) a documented data-handling story — which for WhoCards is genuinely simple (no PII beyond an anonymous Device id already used elsewhere in the product, per `CONTEXT.md`'s **Device** concept).

---

## 3. v1 shape and what's reusable

**What v1 shows**: one Card — the always-dark question face, same "brand object" design language as `card-image.ts` (navy maze background, auto-sized question text, WHOCARDS.CC wordmark) and the mobile Pick-a-Card face — plus host-only Next/Pick controls and a language picker. It is explicitly _not_ the full `/play` page.

**Reuse vs. purpose-built**:

- `packages/decks/src/engine` (`nav.ts`, `pick.ts`, `games.ts`, `direction.ts`, `shuffle.ts`) is pure, host-agnostic, and framework-free — it's already the right shape for this: a host's client dispatches an action (`pick`/`next`/`previous`), the resulting `{ids, idx}` (i.e. current question id) is the one thing that needs to cross the wire to other clients. No engine changes needed.
- `apps/website/src/components/Play/Play.tsx` is **not** reusable as-is: it's built entirely around one device driving its own local `useReducer`, `localStorage` language, and `?q=`/`?lang=` URL state — there is currently no server-authoritative or multi-client concept anywhere in the web player (confirmed by reading it end-to-end: nav state lives in a React reducer seeded from the URL, language in `localStorage`). A video-call surface needs the opposite shape: **one client (host) is authoritative, N clients are read-only mirrors** — different enough from Play's single-device model that a purpose-built minimal view (card render + host-gated controls, built once and shared across platform shims) is the right call, not a retrofit of `/play`.
- `apps/website/src/server/card-image.ts` supplies the design language reference (colors, wordmark, type sizing) to match — not code to import into an iframe view, since it renders static PNGs server-side, but the CSS/HTML "recipe" it encodes is exactly what the in-call card should visually match.
- The `packages/api` tRPC router (`docs/adr/0002`) is the natural home for a new minimal endpoint set: "start an in-call session," "get current card for a session," "advance a session" — small, typed, and consistent with how mobile already consumes the API.

**Does the backend state need something new?** Evaluated honestly per platform:

- **Zoom**: no — its own SDK does the realtime fan-out; WhoCards only needs a durable "current state per session" row for late-joiner hydration, which is a normal Postgres write on the existing Netlify Functions/Astro-SSR path (ADR-0002's pattern). No websockets, no new service.
- **Teams**: no — Live Share's free managed Azure Fluid Relay does the realtime sync entirely; WhoCards' backend involvement shrinks to almost nothing beyond serving question content and (optionally) analytics.
- **Meet / Discord**: **yes, honestly** — with Co-Doing closed and Discord shipping no sync primitive at all, a real-time "host clicks next, others see it within ~1s" experience on either platform requires WhoCards to either (a) stand up its own low-latency channel (a small dedicated realtime service — e.g. a lightweight WebSocket/SSE worker, or a managed pub/sub like Ably/Pusher — since Netlify's standard Functions are stateless/short-lived and not a fit for long-held WebSocket connections), or (b) fall back to short-interval polling against the existing Postgres+Netlify stack (e.g. every 1–2s), which needs no new infrastructure and is very likely "good enough" for a host advancing a card once every 30–90 seconds of conversation. Polling is the honest, no-new-infra answer for a v1 on either of these platforms if/when they're built.

---

## 4. Platform recommendation, with the ai-at-work strategy in view

`docs/growth/03-growth-strategy.md`'s Lever 5 names the AI-at-work B2B wedge as "the most likely first revenue" and the highest-willingness-to-pay channel, converting through team workshops and subscriptions — i.e. **work calls are exactly where this feature's audience already is.** That argues for weighting audience fit toward workplace-video-call platforms over Discord (whose audience, per the epic itself, is "social, not work" — a poor match for a feature meant to serve the work-deck funnel first).

Within the workplace platforms:

- **Zoom** wins on effort: a real, GA, ungated broadcast primitive; the widest workplace install base to make a marketplace listing worth the review cost as a discovery channel (the growth doc explicitly flags "marketplace listings = discovery channels" as a funnel implication).
- **Teams** is _technically_ the easiest of all four (Live Share's `LiveFollowMode` is close to a drop-in match for "host controls, others follow") and a strong fit for the Microsoft-365-heavy segment of the AI-at-work audience — a very credible **platform #2**, not a consolation prize.
- **Google Meet** is the weakest workplace choice _right now_, purely because of the closed Co-Doing program — not because of audience fit (Meet is arguably as work-heavy as Zoom). Worth re-evaluating if/when Co-Doing reopens or Google ships a GA replacement.
- **Discord** should stay last: right audience for the _messaging-bot_ epic (#179) but not for in-call, work-first video presence.

**Recommended sequencing: Zoom → Teams → (Meet once Co-Doing reopens) → Discord skipped for this epic** (Discord's activity model is a better fit for #179's bot work than for #180's video-call work, per the epic's own scope note).

### Architecture sketch

A thin shared web surface (one minimal Card + host-controls view, framework-agnostic React, styled to match `card-image.ts`'s design language) served from the existing website/API infra, embedded via a **per-platform manifest/adapter shim**:

- Zoom: a Zoom App manifest + a small adapter using `@zoom/appssdk` for host-role detection and `sendMessage` broadcast, calling the shared view.
- Teams: a Teams app manifest (`meetingStage` context) + a `@microsoft/live-share` adapter wrapping the same shared view in `LiveState`.
- (Later) Meet: an add-on manifest + Meet Add-ons SDK adapter, sync strategy TBD pending Co-Doing.

This mirrors the "thin shared web surface + per-platform adapter" pattern epic #180 itself names as likely shared with #179 — worth confirming once #179's research doc exists.

### What to validate with a prototype, before marketplace submission

1. Build the Zoom adapter first as an **unlisted/dev-mode app** (no marketplace review needed to test) and run it in a real WhoCards team call to test the actual UX: does "each participant opens their own panel" feel like "everyone sees it in the call UI," or does it feel like yet another tab to open — i.e. does it pass the soul test (`soul.md` #1: does it pull eyes back to the screen, or deepen the table conversation)? This is the single biggest unvalidated assumption in this doc.
2. Confirm host-role detection is reliable via Zoom's context object across desktop/web clients before building the Next/Pick gating on it.
3. Time-box the late-joiner hydration endpoint — confirm a simple Postgres row is sufficient latency-wise (no polling needed on the Zoom path, since `sendMessage` handles ongoing sync; hydration is a one-time fetch on join).
4. Only after that UX validation, decide whether to invest the marketplace-review time (weeks) for public discovery, or keep it as an unlisted app distributed directly to AI-at-work customers first.

---

## Proposed child issues

_(Not filed — owner picks direction first, per the epic.)_

1. **Zoom App prototype: unlisted dev-mode in-call card** — Build the minimal shared card view + a Zoom adapter (`@zoom/appssdk`, `sendMessage` broadcast, host-role gating) as an unlisted app; validate in a real WhoCards call. No marketplace submission yet. Answers the soul-test question in §4.1 before any further investment.

2. **Minimal shared-state backend: late-joiner hydration endpoint** — A small `packages/api` tRPC endpoint (`getInCallSession`/`advanceInCallSession`-shaped) backed by one new Postgres table, purely to answer "what's the current card?" for a client that opens mid-session. Needed by the Zoom prototype (#1) and reusable by Teams/Meet later.

3. **Teams Live Share adapter** — Build the same shared card view behind a `@microsoft/live-share` (`LiveState`/`LiveFollowMode`) adapter in the `meetingStage` frame context. Lower risk than Zoom (no custom sync to write) — candidate for platform #2 once #1 validates the UX pattern.

4. **Zoom App Marketplace submission** — Once the prototype (#1) validates the UX, package the app for public listing: privacy policy, technical design doc, OAuth-scope justification, and the security review. Budget low-single-digit weeks per the documented 72-hour-per-step SLA.

5. **Re-evaluate Google Meet when Co-Doing (or a GA replacement) reopens** — Time-boxed periodic check (e.g. quarterly) on Co-Doing API / Co-Watching API early-access status; Meet add-on work stays parked until a first-party sync primitive is available, per §1b.

6. **PostHog instrumentation for in-call draws** — Once any platform ships, add a distinct event source (e.g. `source: 'zoom_incall'`) to the existing `deck_opened`/`question_shown` funnel (`apps/website/src/components/Play/Play.tsx`'s tracking pattern) so in-call usage is visible in the funnel described in `docs/growth/03-growth-strategy.md` §4.
