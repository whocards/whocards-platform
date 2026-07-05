# WhoCards @ Work — the video-call surface (issue #180)

_Prepared 2026-07-05. Answers issue #180 ("show a question in-call without screen sharing,"
Zoom-first) as a surface of epic #201 (`docs/adr/0008-authenticated-app-on-tanstack-start.md`,
the `apps/app` RBAC/moderation foundation) and the business plan's §12
(`docs/strategy/ai-at-work-business-plan.md`) — "a question shown in-call **is** a shared screen
without screen-share, driven by the same moderation cockpit as the TV surface and the app."
Builds on `docs/spikes/0001-video-call-plugins.md` (phase-1 research, merged PR #184): that doc's
per-platform ranking still holds; this one re-verifies and sharpens the Zoom mechanics against
Zoom's current docs, ties the architecture to the RBAC/tRPC pattern `apps/app` now actually runs
(it didn't exist yet when the spike was written), and adds a concrete MVP timeline + open
decisions for a build/ship call._

## TL;DR recommendation

Build a **Zoom App** as the first video-call surface, and design it around **all three** of
Zoom's participant-visibility mechanisms as complementary layers, not alternatives: **Collaborate
Mode** for the "everyone sees it automatically, no one goes hunting for an app" moment (the part
that actually satisfies the epic's "no screen sharing" bar), the base SDK's **`sendMessage`
broadcast** for live next-card updates once joined, and one small **WhoCards-owned state row** for
late-joiner/reconnect hydration (neither Zoom mechanism is durable). None of this needs new
infrastructure — reuse `packages/decks`' engine untouched, reuse `apps/app`'s existing
`roleProcedure`/`ROLE_RANK` RBAC pattern for "who may host," and reuse the Card design language
already encoded in `card-image.ts`. **Validate for free first**: a Zoom **Private app** installed
in a WhoCards-controlled account needs **zero Zoom review** to build and test end-to-end,
including Collaborate Mode, in a real WhoCards team call — Marketplace review (weeks) is only a
question once that validation passes. **Google Meet stays parked**: its Co-Doing API — the only
first-party low-latency shared-state primitive for Meet add-ons — is still a closed early-access
program, re-confirmed directly against Google's docs today, unchanged from the spike two days ago.

A structural point worth surfacing before the mechanics: **this is the first thing to actually
need `CONTEXT.md`'s dormant "Facilitation Mode" entry** — "a planned hosted way of running a Game
for a group... its relationship to the three Games is not yet decided... not yet built." Video
(#180), the TV surface (#213), and the moderation cockpit (#214) are all converging on the same
underlying primitive: a host-controlled, shared traversal of a Deck for a group. §2 proposes
naming and shaping the new backend row so it's that primitive's first slice, not a Zoom-specific
one-off — the video surface's job is to answer a question the glossary has been leaving open.

---

## 1. What a Zoom App can actually show, in-call, without screen sharing (2026)

**The framing question is already answered by construction.** A Zoom App runs as an iframe panel
inside the Zoom client itself (collapsed/expanded side panel by default, or popped out into its
own window) — it is never a screen share, regardless of which sync mechanism below is used.
Gallery view stays intact, the presenter doesn't lose their own camera tile, and there's no "one
person owns the screen" ownership problem. ([Design principles and
guidelines](https://developers.zoom.us/docs/zoom-apps/design/design-principles-and-guidelines/))
So the real question the epic's phrasing is actually asking is narrower and harder: **does the
card show up for every participant automatically, or does each of them have to go find and open an
app themselves?** Three distinct mechanisms answer that differently, and — this is the sharpest
correction to the prior research — they combine rather than compete:

| Mechanism                                                                                    | What a participant experiences                                                                                                                                                                         | Extra review to ship?                                                                                                                                                                | Carries ongoing updates?                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Base SDK `sendMessage`/`onMessage`, `postMessage` broadcast                                  | **Nothing**, unless they already manually opened the app panel themselves — once open, broadcasts arrive live                                                                                          | No — ships in the base SDK, no toggle                                                                                                                                                | Yes, but only to instances that are already open                                                                 |
| `sendAppInvitation` (`getMeetingParticipants` → `sendAppInvitation` → `onSendAppInvitation`) | Gets a named, dismissible invitation; still has to click to open/accept it                                                                                                                             | No                                                                                                                                                                                   | No — it's a one-shot invite, not a sync channel                                                                  |
| **Collaborate Mode** (`startCollaborate`/`joinCollaborate`/`onCollaborateChange`)            | **Automatically** sees a live preview of the host's app ("similar to a shared screen view") plus a one-click join prompt; a participant who joins the meeting later gets the same prompt automatically | **Yes** — toggling `collaborate_mode.enable` "requires resubmission for app review" once an app is published (free to build and test with dev credentials in your own account first) | No — Zoom hands the app a shared **Collaborate UUID**; your own backend/broadcast still carries the actual state |

Sources: [`@zoom/appssdk` class reference](https://appssdk.zoom.us/classes/ZoomSdk.ZoomSdk.html),
[Collaborate Mode
guide](https://developers.zoom.us/docs/zoom-apps/guides/collaborate-mode/), [Inviting
Participants to Use Apps](https://developers.zoom.us/docs/zoom-apps/guides/invite-participants/),
[Zoom blog — Collaborate Mode &
breakout rooms](https://www.zoom.com/en/blog/zoom-apps-collaborate-breakout-rooms/), devforum
threads on
[`postMessage`](https://devforum.zoom.us/t/postmessage-api-send-payload-to-remote-participant-connected-with-zoom-apps-onmessage-event/84915)
and [broadcast
gaps](https://devforum.zoom.us/t/zoom-apps-sdk-missing-features-send-chat-broadcast-message-onaudio-video-change/84991).

**Why this matters more than it looks:** the prior spike leaned toward plain `sendMessage`
broadcast specifically to avoid Collaborate Mode's re-review step — but plain broadcast alone
doesn't actually clear the epic's own bar. A participant who hasn't already found and opened the
WhoCards panel sees nothing at all; the host would have to verbally walk every participant through
"open Apps, find WhoCards" — arguably worse friction than sharing a Slido link. Collaborate Mode's
automatic preview-plus-one-click-join is the only one of the three that matches "everyone sees it
in the call UI itself" as literally stated. The good news, confirmed directly: Collaborate Mode
can be built and exercised with **development credentials inside your own account before any
review step** — the resubmission requirement only bites when you actually want to _distribute_ the
change (a Marketplace app, listed or unlisted). Building and validating it privately is free. One
more small but telling signal that Zoom already has this exact use case in mind: the manifest's
`collaborate_mode.enable_play_together` flag literally rebrands the join prompt as **"Play
Together"** for game-like apps.

None of the three mechanisms is durable. A participant who reconnects, or opens the app for the
first time mid-session, has missed every prior broadcast and every prior Collaborate state change.
That means WhoCards needs a small amount of its own backend state regardless of which mechanism is
used — not for the realtime fan-out (Zoom carries that), purely so a client can ask "what's the
current card?" once on open or reconnect.

### Distribution and review, precisely (a correction worth having)

| Lane                                       | Zoom review?                                                                  | Who can install it                        | Limits                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Private app**                            | **None**                                                                      | Only members of your own Zoom account     | none stated beyond account membership                                                                                                         |
| **Beta app** (shared outside your account) | Yes — Zoom's review team approves the _share_, reported **3–4 business days** | Whoever you send the authorization URL to | 10 installs account-level / 100 user-level; URL expires in **4 weeks**, renewable **twice** (~12 weeks total before a real listing is needed) |
| **Marketplace — unlisted**                 | **Yes — the full two-phase review**, same bar as listed                       | Anyone with the direct link               | Not a shortcut around review — it only skips Marketplace search/discovery                                                                     |
| **Marketplace — listed**                   | Yes — same two-phase review                                                   | Anyone browsing the Marketplace           | none                                                                                                                                          |

Sources: [App distribution overview](https://developers.zoom.us/docs/distribute/), [Sharing
Private and Beta Apps](https://developers.zoom.us/docs/distribute/sharing-private-and-beta-apps/),
[App Review Process](https://developers.zoom.us/docs/distribute/app-review-process/), [Zoom
Security Review Process
(KB0058021)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058021).

This refines a claim in the prior spike: **"unlisted" is not the free validation lane** — it still
requires the identical two-phase review as a fully public listing; it only hides the app from
search. The actual zero-review lane is **Private** (your own account only), and the
cheap-but-not-free lane for testing beyond your own account is **Beta** (days, not weeks, but
capped and time-boxed). On timeline: Zoom's current docs decline to commit to a fixed review SLA —
"processed 9am–5pm Pacific, Monday–Friday," reviewed "in a single day" for a clean, well-scoped
app, open-ended for a messy one. The prior spike cited a 72-hour-per-queue-step figure; **I could
not re-find that specific number in Zoom's current docs during this pass** — treat "low
single-digit weeks for a clean submission" as the planning number, not a guarantee, and confirm
directly with Zoom (or a developer who's shipped recently) before promising an external date.

**One genuine speed advantage worth naming:** because this design is entirely client-SDK-driven
(`getRunningContext`/`getMeetingContext`/`sendMessage`/collaborate calls the Zoom client makes
inside the iframe on the app's behalf), it needs **no OAuth scopes to call Zoom's own server-side
REST API** at all — WhoCards' backend never talks to Zoom directly. OAuth-scope justification is a
big share of typical review friction; this app barely touches that surface. ([OAuth scopes
overview](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/), [manifest
`features` schema](https://developers.zoom.us/docs/build-flow/manifests/schema/features/))

---

## 2. Recommended architecture

Zoom first, unchanged from the prior spike's ranking (real GA sync primitives, the largest
workplace-video install base, the cleanest serverless fit) — but built against Collaborate Mode
from day one, per §1, with the three mechanisms layered:

1. **Collaborate Mode** → the automatic "everyone sees a join prompt, no app-hunting" moment.
2. **`sendMessage` broadcast** to joined instances → the live "host clicked next, every card
   updates" channel once inside a Collaborate session.
3. **One small WhoCards-owned row** → late-joiner/reconnect hydration, since neither Zoom mechanism
   is durable.

### Reuse, concretely

- **`packages/decks/src/engine` untouched.** `getInitialNav`/`navReducer`
  (`packages/decks/src/engine/nav.ts`) already model exactly the state a host's session needs — an
  ordered `ids: QuestionId[]` plus a `idx`, advanced by `next`/`previous`/`reset` actions, pure and
  framework-free. `getDeck(slug)`/`resolveDeck`
  (`packages/decks/src/decks/registry.ts`) resolve a deck slug (`'library'`, `'ai-at-work'`, …)
  into its question set. A host's `pick`/`next`/`previous` action is the one thing that has to
  cross the wire; nothing about the engine changes.
- **Visual: a new, minimal purpose-built card view**, not `/play`. Confirmed again by reading
  `apps/website/src/components/Play/Play.tsx`'s shape: single-device `useReducer` + `localStorage`
  language — built around exactly one device driving its own state, the opposite of "one host is
  authoritative, N participants are read-only mirrors." Match `apps/website/src/server/card-image.ts`'s
  design language (navy maze background, auto-sized question text, wordmark) rather than importing
  any of its code (it renders static PNGs server-side).
- **Host authority = the RBAC `apps/app` already has, not a bespoke scheme.**
  `apps/app/src/server/trpc/trpc.ts` already defines `roleProcedure(min: AppRole)`, gating on the
  five-level `ROLE_RANK` hierarchy (`member < reviewer < facilitator < admin < owner`) via
  better-auth's organization/member model. A `facilitator`+ member of a WhoCards @ Work org is
  exactly "who's allowed to start/control a video session" — the same authority model the
  moderation cockpit (#214) will need for every other surface, so this surface should consume it,
  not fork it.
- **Language**: reuse the Deck's existing `languages`/`languageStorageKey` presentation fields
  (`packages/decks/src/types.ts`'s `DeckPresentation`) — the host picks a language for the session
  (there's no per-participant Device to carry a personal preference here), which is a straight
  `Display setting` in `CONTEXT.md`'s terms: it changes how a Card looks, never which Card is drawn.

### The new primitive — and why it should be named for what it really is

`apps/app/src/server/db/schema.ts` already has the shape to extend: `questionReview`,
`questionComment`, etc. — additive tables alongside better-auth's `app_*` set. A video session
needs the same treatment: **one small table**, additive migration, no new infrastructure. The
naming choice matters more than it looks. Calling it `zoom_session` optimizes for the platform in
front of us; but `CONTEXT.md` already has an unclaimed concept for exactly this shape — **"a
planned hosted way of running a Game for a group... not yet built."** TV (#213) needs the identical
row (host advances, N displays mirror it); the moderation cockpit (#214) is explicitly meant to
generalize a control plane "across mobile/web/TV/video/chat/events." Recommend naming the table
`facilitation_session` (or similar) — video-specific bits (the Zoom Collaborate UUID, say) live in
a small `platform`/`external_ref` column, not in the table's identity — so #213 and #214 inherit it
rather than re-deriving it. This v1 is deliberately a **thin slice** of Facilitation Mode as
`CONTEXT.md` describes it — no host-controlled timer, no explicit Skip yet, just host-controlled
advance — built so those can layer on additively once Facilitation Mode's relationship to the
three Games actually gets decided (see §5).

Sketch (illustrative, not a committed schema):

```ts
// apps/app/src/server/db/schema.ts (additive)
export const facilitationSession = pgTable('facilitation_session', {
  id: text('id').primaryKey(), // opaque, unguessable — participants never see the org/host id
  organizationId: text('organization_id')
    .notNull()
    .references(() => appOrganization.id),
  startedBy: text('started_by')
    .notNull()
    .references(() => appUser.id),
  platform: text('platform').notNull(), // 'zoom' | 'teams' | … — the adapter, not the concept
  externalRef: text('external_ref'), // e.g. the Zoom Collaborate UUID, once joined
  deckSlug: text('deck_slug').notNull(),
  language: text('language').notNull(),
  currentQuestionId: text('current_question_id'),
  navState: text('nav_state'), // serialized {ids, idx} from navReducer — resume exactly where the host left off
  startedAt: timestamp('started_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

And a router alongside `people`/`questionReview`/`discussionAgent` in
`apps/app/src/server/trpc/root.ts`:

```ts
export const facilitationSessionRouter = createTRPCRouter({
  // facilitator+, org-scoped — mirrors questionReview's approve gating
  start: roleProcedure('facilitator').mutation(/* create a row, return its opaque id */),
  advance:
    roleProcedure(
      'facilitator'
    ).mutation(/* {action: 'pick'|'next'|'previous'} → navReducer → persist + the caller still owns broadcasting via sendMessage */),
  // no auth at all — a participant is not a WhoCards user, just a reader of one session's state
  getState:
    publicProcedure.query(/* keyed only by the opaque session id — late-join/reconnect hydration */),
})
```

Participants never authenticate to WhoCards — lighter even than `CONTEXT.md`'s **Device** concept
(no id is minted on their side at all); they're anonymous readers of one session's current state,
which matches "no screen share, no login wall" as a participant-facing promise. **Recording**: v1
should _not_ wire this into the `packages/decks/src/contract.ts` `AnswerEvent`/`RecordAnswer`
path — whether an in-call "shown" counts as **Answered** (leaving the Global Game's shared
answered-set) is exactly the undecided question `CONTEXT.md`'s Facilitation Mode entry flags
("its relationship to the three Games… is not yet decided"). Defer that decision rather than
silently picking Global-Game semantics for a use case (a facilitator running one group's
conversation) that doesn't obviously want to share circulation with individual mobile/web players.

### The Zoom-specific adapter (thin)

`@zoom/appssdk` calls only: `getRunningContext`/`getMeetingContext` for host/co-host detection
inside the panel (gating which controls even render), `startCollaborate`/`onCollaborateChange` for
the join moment, `sendMessage`/`onMessage` for live updates. Note the **double gate**: Zoom's own
context says who is host/co-host in the meeting; `roleProcedure('facilitator')` says who is
authorized in WhoCards. Both must agree — a meeting host who isn't a WhoCards facilitator can open
the panel but shouldn't be able to start a session; that's a real product decision (does the app
prompt them to sign in? show a read-only state?) not just a permissions checkbox.

Manifest sketch (field names drawn from Zoom's build-flow schema docs; confirm the exact shape in
the actual build-flow UI when registering the app — not hand-verified beyond the docs):

```json
{
  "name": "WhoCards",
  "features": {
    "products": [
      {
        "development_home_uri": "https://app.whocards.cc/surfaces/zoom/dev",
        "production_home_uri": "https://app.whocards.cc/surfaces/zoom"
      }
    ],
    "in_client_feature": {
      "zoom_app_api": {
        "enable": true,
        "zoom_app_apis": [
          "getSupportedJsApis",
          "getRunningContext",
          "getMeetingContext",
          "sendMessage",
          "onMessage",
          "startCollaborate",
          "joinCollaborate",
          "onCollaborateChange"
        ]
      },
      "collaborate_mode": {
        "enable": true,
        "enable_screen_sharing": false,
        "enable_play_together": true
      }
    }
  }
}
```

`app.whocards.cc` is the domain issue #203 already names for `apps/app`; the Zoom iframe's home URL
would point at a route there (e.g. `/surfaces/zoom`), not at `apps/website`.

### v1 is one-way — the richer moderation-cockpit features stay out of scope for now

`CONTEXT.md` and the business plan (§12a) both point at a richer cockpit — anonymous submission,
controlled reveal, consent — but the epic's own v1 shape ("a question card, host next/pick,
language") is deliberately one-way: host shows, participants view. Worth flagging, not building:
participants reacting or submitting through the same Zoom panel (the app already has a channel back
to the host via `sendMessage`) is a natural, additive next step once #214 exists, not a v1
requirement.

---

## 3. Realistic MVP and what it takes to ship

| Phase                          | What                                                                                                                                                                                                                                                                                                   | Zoom review?                                           | Time                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **0 — Private validation**     | Build the adapter, shared card view, `facilitationSession` router/table; install as a **Private app** in a WhoCards-controlled Zoom account (needs an account with the developer role enabled); validate the soul-test question (`docs/spikes/0001…`'s framing) in a real WhoCards team call           | **None**                                               | Days                                                                                                |
| **0.5 — Add Collaborate Mode** | Same Private/dev-credentials install, flip on Collaborate Mode; confirm the automatic join-prompt experience actually reads as "no screen share, everyone sees it" rather than another modal to dismiss                                                                                                | **None** (dev credentials)                             | Days                                                                                                |
| **1 — Real customer pilot**    | (a) hand a WhoCards @ Work customer their own copy to sideload as _their own_ Private app under _their_ Zoom account admin — zero review, since it's their account; fastest path to a real paying-customer validation. Or (b) a **Beta** share if distributing beyond one customer's own admin control | (a) none; (b) 3–4 business days for the share approval | (a) same day; (b) about a week, capped at 10/100 installs, 4-week expiry (renewable twice)          |
| **2 — Marketplace**            | Only once §1's validation passes: hosted privacy policy, technical design write-up, OAuth-scope justification (minimal, per §1), the two-phase review (metadata/compliance, then security audit)                                                                                                       | Full review                                            | Low-single-digit weeks for a clean submission, as a planning number — not a guaranteed SLA (see §1) |

No new infrastructure provider at any phase — same Netlify + Postgres + tRPC stack `apps/app`
already runs on. The only genuinely new skill is the Zoom Apps SDK client integration itself, and
that surface is small (a handful of SDK calls, no server-side Zoom API usage).

---

## 4. Teams and Meet later — and why Meet is parked

**Teams is a real platform #2, not a fallback**, unchanged from the prior spike: Live Share
(`@microsoft/live-share`)'s `LiveState`/`LiveFollowMode` over a free, Microsoft-managed Azure Fluid
Relay session needs **zero custom sync backend**, and the `meetingStage` frame context is
explicitly the "no screen share, embedded in the call surface" placement. The same shared card view
wrapped in a Teams-specific adapter reuses `LiveState` for the live channel; `facilitation_session`
is only consulted for durable/late-join state, since Live Share's own relay carries the live sync —
exactly the role it already plays for Zoom. ([Live Share
overview](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/teams-live-share-overview))

**Meet stays parked, and here's why, re-verified today rather than trusted from two days ago:**
fetched directly against Google's current docs, the Co-Doing API page still states, verbatim,
_"This program is now closed to new signups."_ Unchanged from the prior spike's finding on
2026-07-03. The Meet Add-ons SDK itself (main stage/side-panel embedding, `startActivity()`) is GA
and ungated — the embedding capability exists — it's specifically the **ongoing low-latency
shared-state primitive** that's closed to new integrators. Without it, Meet costs WhoCards the same
price as Discord: build and operate a realtime channel, or poll. ([Co-Doing API
guide](https://developers.google.com/workspace/meet/add-ons/guides/use-CoDoingAPI))

Two ways this could move sooner than "wait for Google": (a) a quarterly check (or a direct support
ticket to Google) on Co-Doing/GA-replacement status; (b) once the Zoom/Teams
`facilitation_session` backend exists anyway — it's needed for late-join hydration on both — a Meet
client that simply **polls `getState` every 1–2 seconds** is a small incremental build on
infrastructure that already exists. Worse latency than Zoom/Teams's push channels, but plausibly
fine for a host advancing a card every 30–90 seconds of live conversation. Worth doing sooner than
"wait for Co-Doing" if a specific customer asks for Meet by name.

**Discord stays out of scope for this epic** — confirmed by both the epic's own framing (social
audience, not work) and the sibling research (`docs/spikes/0002-messaging-platform-bots.md`),
which is a better fit for the messaging-bot epic (#179).

---

## 5. Open decisions for Avi

1. **Where does the router/table live** — `apps/app` (co-located with the RBAC/org model it
   depends on) or the shared `@whocards/api`? I lean `apps/app`, since the auth dependency is
   `apps/app`-native — but the Zoom-facing iframe route needs to be publicly reachable, which is a
   question about `apps/app`'s own pre-launch reachability at `app.whocards.cc` (#203).
2. **Gate hosting behind a paid org, or open to any signed-in facilitator?** A monetization-ladder
   call (business plan §5, Tier 2/3) more than a technical one.
3. **Whose Zoom account hosts the first Private-app validation?** Needs an account with the
   developer role enabled — Avi's own, or a dedicated WhoCards one.
4. **Build against Collaborate Mode from day one (my recommendation, §2), or ship plain-broadcast
   first and fast-follow?** I lean the former since plain-broadcast-only likely doesn't clear the
   epic's own bar, but it is more surface to build before the very first live validation.
5. **Naming and sequencing against #214 (moderation cockpit, not yet built):** build
   `facilitation_session` narrow and now, flagged for #214 to absorb later (my recommendation), or
   wait for #214 to define the cross-surface session shape first? Also: does this mean
   `CONTEXT.md`'s "Facilitation Mode" entry should be resolved (its relationship to the three
   Games decided) as part of this work, or is that a separate, later glossary change?
6. **File the child issues below now, or leave them unfiled** pending Avi's read of this doc (the
   prior spike left its own list unfiled for the same reason)?

---

## Proposed child issues (not filed)

1. **Zoom App prototype (Private, own account)** — adapter + shared card view +
   `facilitationSession` router/table; validate the soul test live in a real WhoCards call.
2. **Add Collaborate Mode to the prototype** (still Private/dev credentials) — validate the
   automatic-join experience specifically, before any review step.
3. **`facilitation_session` backend** (table + router) — usable by Zoom now, Teams/Meet later
   unmodified; the first slice of `CONTEXT.md`'s Facilitation Mode.
4. **Teams Live Share adapter** — platform #2, lower technical risk than Zoom (no custom sync to
   write).
5. **Zoom Marketplace submission** — privacy policy, technical design doc, OAuth-scope
   justification, the two-phase review — only once the prototype validates the UX.
6. **PostHog: in-call draws as a distinct source** — same pattern both this doc and
   `docs/spikes/0002-messaging-platform-bots.md` name for their respective surfaces.
7. **Quarterly check: Google Meet Co-Doing API / GA-replacement status** — Meet work stays parked
   until it reopens, or until customer demand justifies the polling fallback (§4).

---

## Sources

- [`@zoom/appssdk` v0.16.39 class reference](https://appssdk.zoom.us/classes/ZoomSdk.ZoomSdk.html)
- [Zoom Apps — Collaborate Mode guide](https://developers.zoom.us/docs/zoom-apps/guides/collaborate-mode/)
- [Zoom Apps — Inviting Participants to Use Apps](https://developers.zoom.us/docs/zoom-apps/guides/invite-participants/)
- [Zoom Apps — Design principles and guidelines](https://developers.zoom.us/docs/zoom-apps/design/design-principles-and-guidelines/)
- [Zoom blog — Increase Collaboration and Engagement with Latest Zoom Apps Updates](https://www.zoom.com/en/blog/zoom-apps-collaborate-breakout-rooms/)
- [Zoom Developer Forum — postMessage to remote participants](https://devforum.zoom.us/t/postmessage-api-send-payload-to-remote-participant-connected-with-zoom-apps-onmessage-event/84915)
- [Zoom Developer Forum — SDK missing features thread](https://devforum.zoom.us/t/zoom-apps-sdk-missing-features-send-chat-broadcast-message-onaudio-video-change/84991)
- [App distribution overview](https://developers.zoom.us/docs/distribute/)
- [Sharing Private and Beta Apps](https://developers.zoom.us/docs/distribute/sharing-private-and-beta-apps/)
- [App Review Process](https://developers.zoom.us/docs/distribute/app-review-process/)
- [App Review Guidelines and Principles](https://developers.zoom.us/docs/distribute/app-review-guidelines/)
- [Zoom Security Review Process (KB0058021)](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058021)
- [OAuth scopes overview](https://developers.zoom.us/docs/integrations/oauth-scopes-overview/)
- [Build Flow — manifest `features` schema](https://developers.zoom.us/docs/build-flow/manifests/schema/features/)
- [Microsoft Teams — Live Share overview](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/teams-live-share-overview)
- [Google Meet Add-ons — Co-Doing API guide (re-verified 2026-07-05: still closed to new signups)](https://developers.google.com/workspace/meet/add-ons/guides/use-CoDoingAPI)
- `docs/spikes/0001-video-call-plugins.md` (prior phase-1 research, PR #184)
- `docs/spikes/0002-messaging-platform-bots.md` (sibling epic #179 research)
- `docs/strategy/ai-at-work-business-plan.md` §12–13
- `docs/adr/0008-authenticated-app-on-tanstack-start.md`
- `CONTEXT.md` (Facilitation Mode, Device, Game/Global Game/Answer record)
