# TV / shared-screen surface — design doc

_Prepared 2026-07-05. Feeds issue
[#213](https://github.com/whocards/whocards-platform/issues/213), part of epic
[#201](https://github.com/whocards/whocards-platform/issues/201). Companion to the moderation
cockpit ([#214](https://github.com/whocards/whocards-platform/issues/214)) and the business plan's
§12b. **Note:** `docs/strategy/ai-at-work-business-plan.md` currently lives on branch
`feat/whocards-app-foundation` (draft PR [#215](https://github.com/whocards/whocards-platform/pull/215),
not yet merged) — this doc was written against that content and will sit alongside it in
`docs/strategy/` once #215 lands._

> **One-line thesis** (business plan §12b): phones are the moderation remotes, the big screen is
> the shared "board" — the Jackbox pattern applied to work. Three jobs: **in-room facilitation**
> (conference room / offsite), **ambient retention** ("question of the day" on office/lobby
> screens), and a **less-crowded distribution channel** (Apple TV / Google TV / Roku / Samsung /
> LG) plus a consumer wedge (family game night) feeding brand top-of-funnel.

## TL;DR recommendation

Ship the **web cast / shared-screen mode** first (§1a): a big-screen **Board** view + a phone
**Remote** view, both new and thin, reusing `packages/decks`' engine untouched and talking through
one small new tRPC router. No native code, no app-store review, no new realtime infrastructure —
short-interval polling is enough, for the same reason issue #180's own research already concluded
polling is enough where no platform SDK does the sync for you. This ships the highest-priority job
(in-room facilitation) in days, and the ambient-signage job comes almost free on top of it (it's
just an autoplay **Display setting**, `CONTEXT.md`'s term, on the existing `/play`). Native TV apps
and the video-call surface are real options, but deliberately **not** the first move — see §1.

A minimal spike ships with this doc: `/dev/tv-board` (dev-only, `apps/website`) — one deck rendered
in big-screen type next to a mock room code, no backend wiring. It's there to let you eyeball the
visual direction on an actual screen; it does not prove the pairing mechanism (§3), which is
unbuilt. See §6 and the screenshot in this doc.

---

## 1. Options, ranked by lift

|                                               | Lift                                         | What it needs                                                               | What it actually satisfies                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Web cast / shared-screen**              | **Low — days**                               | 2 new thin web views + 1 small tRPC router + 1 Postgres table (§3–4)        | In-room facilitation _now_. Ambient signage nearly free on top. Runs on anything with a browser: a laptop over HDMI, a smart TV's own browser, an AirPlay-mirrored iPad, a $30 Fire Stick. |
| **(b) Lean on the video-call surface (#180)** | N/A — it's already its own epic              | Nothing new from this issue                                                 | Remote/hybrid facilitation **only**. Does not touch ambient signage or app-store distribution. Complementary, not a substitute for (a).                                                    |
| **(c) One native TV app (Apple TV, later)**   | **High**, and platform-dependent (see below) | A real tvOS app — Apple TV has no general-purpose WebView/browser app model | App-store discovery + polish, but only worth it once (a) has real signal.                                                                                                                  |

### (a) Web cast / shared-screen mode — recommended first step

This is exactly what the issue's own scope note asks for, and it is the lowest common
denominator across every "TV" in the three named jobs: a conference-room projector plugged into a
laptop, an office lobby's smart TV, someone's home Chromecast/Apple TV/Fire Stick for the family
game night wedge. All of them can already open a URL. Building this means:

- A **Board** route — a new, purpose-built, read-only, big-screen-safe view (10-foot type, high
  contrast, room code shown small in a corner).
- A **Remote** route — a phone-web page (no app install) with the same Prev / Next / Pick controls
  `<Play>` already has, but writing to a shared session instead of local state.
- One new minimal tRPC router + table so the two can agree on "what's showing right now" (§3).

Nothing here is platform-gated, nothing needs app-store review, and — critically — most of it is
software WhoCards already has (see §4). This is the same conclusion issue #180's research reached
for Discord/Meet (no platform SDK doing the sync ⇒ a tiny Postgres-backed session + polling is "the
honest, no-new-infra answer" — `docs/spikes/0001-video-call-plugins.md` §3). The TV surface is in
that same position for _every_ platform, not just two of them, so the same answer applies more
broadly here.

### (b) Lean on the video-call surface (#180) as the shared screen

Epic #180 (`docs/spikes/0001-video-call-plugins.md`) already answers "should a question show in a
Zoom/Teams call without screen-sharing" — recommendation there is Zoom first, via the SDK's
`sendMessage` broadcast, with a small Postgres row for late-joiner hydration. That _is_ a
shared-screen surface, but it only solves **one** of this issue's three jobs (remote/hybrid
facilitation) — it does nothing for a lobby TV playing "question of the day" with nobody on a
call, and it is not an app-store listing. Treating #180 as "the" TV surface would under-deliver on
two of the three named jobs. The right relationship is **sibling, not substitute** — and, per §4,
the two should share the same backend primitive rather than each inventing one.

### (c) One native TV app (Apple TV), later, only on signal

The issue is explicit: don't ship five native TV apps. Worth being precise about _why_ the five
platforms named in the business plan aren't equally hard, because it changes what "later" actually
costs:

- **Apple TV (tvOS)** is the genuinely hard one. tvOS has no general-purpose WebView/in-app-browser
  model the way iOS does — Apple does not allow a "wrapped website" as a tvOS app (App Store
  Review Guideline 4.2, Minimum Functionality, is routinely enforced against bare web wrappers, and
  tvOS's own app model is TVML/TVJS or SwiftUI/UIKit, not an embeddable full-page browser). A
  tvOS app is a real, separate native build. _(Verify current App Store guidelines before
  committing engineering time — policy details shift.)_
- **Samsung Tizen and LG webOS** are, by contrast, natively **web-app platforms** — their own app
  SDKs package HTML/CSS/JS as the app itself (a signed `.wgt`/`.ipk`), not a wrapper hack. If the
  Board view exists as a web page, packaging it for these two stores is much closer to "repackage"
  than "rebuild."
- **Fire TV and Android TV/Google TV** are Android-based; a WebView-hosting shell is a well-trodden
  pattern there. The usual objection to a WebView app on a TV platform — D-pad focus navigation
  doesn't map cleanly onto arbitrary web content — mostly doesn't apply to the Board specifically,
  because **the Board has no on-screen interactive elements to focus** (all control comes from the
  phone Remote); the TV only needs to render, never receive input, after the app is launched.

So "one native app later" is really "one _hard_ native app later" (Apple TV) plus "three
comparatively cheap repackagings, once there's a reason to bother." None of this is worth doing
before (a) has shipped and shown real usage — it's listed here so that if/when the distribution
job gets prioritized, the effort estimate isn't "5x the same work."

---

## 2. Recommendation, restated

Build (a) only, right now. Concretely, in this order:

1. **Ambient signage, essentially free:** add an autoplay/idle-loop **Display setting** (per
   `CONTEXT.md`'s vocabulary — a presentation choice, not a Game, doesn't touch the draw or the
   answered-set) to the existing `/play` or `/play/[deck]`. This alone covers the "lobby TV plays
   question of the day" job with close to zero new code, and it doesn't need §3's pairing
   mechanism at all — nobody drives it, it just runs.
2. **In-room facilitation, the real build:** the Board + Remote + session router described in §3–4.
   This is the actual point of the issue and where the design effort below is spent.
3. **Everything else waits for signal:** native apps (§1c), participant-submitted content on the
   Board (that's #214's anonymity/consent model, explicitly out of scope here — see §5), and any
   bespoke realtime infrastructure (polling first; only revisit if a real session shows polling lag
   at the table).

---

## 3. Pairing / remote-control mechanism

The proven shape (Jackbox, Slido, Mentimeter) is the same one issue #180 already validated for a
different surface: **one small durable "what's showing right now" record, one authoritative
writer, N read-only viewers.** Concretely:

- The Board, on load, mints a short **room code** (human-typeable — Jackbox-style 4–6 character
  alphabet, unambiguous glyphs) and shows it small in a corner the whole time.
- The facilitator opens a plain URL on their phone (e.g. `whocards.cc/tv/remote`, no app install),
  types the code, and becomes **the controller** for that room. A QR code next to the room code is
  a nice-to-have (see open decisions — it's a new small dependency, not free, so it's not assumed
  here).
- The controller's Prev / Next / Pick taps write to one row; the Board polls that row on a short
  interval (1–2s) and renders whatever it says. No websockets, no SSE, no new service — this is the
  literal fallback issue #180 already spec'd for Discord/Meet ("very likely good enough for a host
  advancing a card once every 30–90 seconds of conversation").
- **v1 has exactly one controller per room and no conflict resolution.** That's a stated, deliberate
  non-goal, not an oversight — the job is one facilitator driving one screen.

### Shape of the new primitive

One new table (name TBD — `facilitation_session` is this doc's working name, see the framing
below), roughly:

```
facilitationSession {
  id
  roomCode          // short, human-typeable, indexed
  deckSlug
  currentQuestionId
  language
  phase             // 'lobby' | 'live' | 'ended'
  controllerToken   // opaque bearer secret the Remote holds; the Board never has it
  createdAt / updatedAt / expiresAt   // short TTL — ephemeral, unlike the Answer record
}
```

One new tiny router in `packages/api` (`sessions`, or similar): `create`, `get(roomCode)`,
`advance({token, action: 'next' | 'previous' | 'pick'})`. This is the same shape issue #180's spike
proposed for its own late-joiner hydration endpoint — see §4 for why these should be the _same_
primitive, not two.

### Reconciling with ADR-0004

`docs/adr/0004-global-game-progress-overlay.md` deliberately rejected a server-authoritative draw
for the **Global Game** — every player draws locally; a network round-trip per card would be slow,
racy, and wrong at that scale (everyone, forever). A facilitation session is a _different, narrower_
thing: one bounded room, a handful of clients, one writer, a lifetime measured in hours. The
concurrency and latency concerns ADR-0004 raised don't apply at that scale, and "everyone in the
room sees the same card at the same instant" is the entire point, so a real server-authoritative
pointer is correct here, not a workaround. This doc proposes that distinction explicitly rather
than quietly contradicting ADR-0004: **the Global/Personal Game's shared-progress overlay is
unchanged; a facilitation session is a separate, orthogonal, explicitly-scoped concept that sits on
top of it.** A card served during a facilitation session still enqueues a normal Answer record
(`packages/decks`' `AnswerEvent`) exactly like any other serve — the facilitation layer decides
_which_ card is current; it doesn't change what "answered" means underneath.

This is also, concretely, what `CONTEXT.md`'s **Facilitation Mode** entry has been waiting for
("a planned hosted way of running a Game for a group... its relationship to the three Games is not
yet decided"). This doc's proposal: Facilitation Mode is not a fourth Game (not a new draw policy)
— it's a hosted-session wrapper (host-authoritative current-card pointer + host controls) that can
sit over the existing Global or Personal Game unchanged. The per-question timer and explicit Skip
that `CONTEXT.md` already names for Facilitation Mode fall out of the same primitive later (`phase`
gains a `phaseEndsAt`; `advance` gains a `skip` action) — nothing in §3's shape forecloses either,
but neither is needed for v1. **This framing is a proposal, not a decision — it resolves a
glossary entry `CONTEXT.md` itself flags as undecided, and Avi should bless or override it (§7).**

---

## 4. Reuse: `@whocards/decks` + the moderation/cockpit model

- **`packages/decks/src/engine`** (`nav.ts`, `pick.ts`, `games.ts`, `shuffle.ts`, `direction.ts`) is
  pure and host-agnostic already — reused **unchanged**. The controller dispatches an action
  (`next`/`previous`/`pick`), the resulting `{ids, idx}` is the one thing that needs to cross the
  wire. This is the identical finding issue #180's research already reached reading the same
  engine for the video-call surface.
- **`<Play>` (`apps/website/src/components/Play/Play.tsx`) is not reused as-is** — it's built
  entirely around one device driving its own local `useReducer` + `localStorage` + URL state.
  ADR-0003 ("no shared UI layer... rebuild the view per platform, share only logic + tokens") and
  #180's own spike both land on the same call: the Board is a **purpose-built, minimal, read-only**
  renderer of `{deckSlug, currentQuestionId, language}`, not a `<Play>` fork. A useful side-effect
  of "purely renders server state, no local reducer": a Board that gets refreshed or restarted
  doesn't lose sync — it just re-polls and re-renders. That should be a stated design goal for the
  Board, not an accident.
- **`packages/api`** gets one new small router (§3). Per ADR-0002 ("host-agnostic tRPC router...
  mounted by whichever app hosts it"), it doesn't matter yet whether that ends up mounted from
  `apps/website`'s existing Astro endpoint or `apps/app`'s TanStack Start host — the logic doesn't
  change either way, which is the entire point of that ADR.
- **Share the primitive with #180, don't duplicate it.** Issue #180's spike already proposed
  "a small `packages/api` tRPC endpoint (`getInCallSession`/`advanceInCallSession`-shaped) backed
  by one new Postgres table" for its own late-joiner hydration. That is functionally the same shape
  as §3's `facilitationSession`. Whichever of #180 or #213 ships first should design its table
  generically enough (deck, current question, phase, an authorization token, timestamps) that the
  other reuses it rather than building a second, slightly-different one. This is the single
  clearest concrete reuse opportunity between the two sibling surfaces the business plan's §12b
  table already names.
- **The moderation cockpit (#214) is the long-term controller.** Read literally, the issue's "big
  screen shows a display surface for the moderation cockpit" means: once #214 exists (on
  `apps/app`, authenticated, RBAC-gated per ADR-0008), it becomes the authoritative writer to this
  same session row/table — richer than the plain Remote (anonymous submission, controlled reveal,
  facilitator-only gating) but writing the _same_ `{currentQuestionId, phase}` shape the Board
  already knows how to render. The Board does not need to know or care whether a plain anonymous
  Remote or the full cockpit wrote the current state. **Concretely: whoever designs #214 should
  adopt/extend this doc's `facilitationSession` primitive rather than invent a parallel one** —
  flagging this now, before #214's own design work starts, is the actual point of writing it down
  here.
- **`packages/tokens`** — the Board's type/color scale should be built from the same tokens
  `apps/website`/mobile already share, not a one-off palette, so a screen genuinely reads as
  WhoCards-branded at 10 feet (the same "brand object" language `card-image.ts` already encodes for
  Share Cards).
- **`@whocards/observability/events`** — instrument the Board/Remote through the existing catalog
  (`deck_opened`, `question_shown`, etc.) with a new `source` value (e.g. `'tv_session'`), exactly
  as #180's spike already recommended for its own in-call source tag, rather than inventing a
  parallel event taxonomy.

---

## 5. What this deliberately does not do (v1 scope)

- **No native TV apps.** See §1c — later, on signal, Apple TV only truly requires one.
- **No new realtime infrastructure.** Polling only; revisit only if a real session shows it lagging
  at the table.
- **No participant-submitted content on the Board.** The business plan ties "enterprise-buyable" to
  #214's anonymous-submission / controlled-reveal / consent / safety-flag model, which doesn't
  exist yet. This surface's v1 is **display + one controller's remote**, full stop — no free-text
  input, no audience polling, nothing that would need a safety or consent story before it can ship.
  That is explicitly #214's job, not this issue's.
- **No multi-controller conflict resolution.** One controller per room in v1 (§3).
- **No permanent history.** A `facilitationSession` row is ephemeral (short TTL); it is not the
  Answer record and doesn't try to be.

---

## 6. The spike

`apps/website/src/pages/dev/tv-board.astro` + `apps/website/src/components/TvBoard/TvBoard.tsx` —
dev-gated exactly like the existing Image Playground (`import.meta.env.DEV` check, 404s in
production, excluded from the sitemap by the existing `/dev` filter in `astro.config.ts`, no nav
link). It renders one deck (`library`, via the existing `getDeck` registry — same data path
`/play` already uses) in a big-screen layout — larger type than `<Play>`, high contrast, a
corner room-code chip — next to a **mock** room code generated client-side on mount. There is no
tRPC router, no new table, no real pairing: the "room code" is not wired to anything. It exists
purely to let the visual direction get looked at on an actual screen before any of §3 gets built.
Deliberately bypasses the marketing `Layout` (no nav/footer) — a real Board never would have it
either, and judging 10-foot readability honestly means judging it without a website's chrome around
it.

![The spike: a big-screen Board showing one question in large type, with a mock room code in the
corner and the WhoCards wordmark bottom-right. Headless Chromium,
1920×1080.](./assets/tv-board-spike.png)

To view it live: `pnpm --filter website dev`, then open `http://localhost:4321/dev/tv-board`
(ideally cast/mirror that tab to an actual TV — the whole point is judging 10-foot readability,
which a laptop screen can't tell you).

---

## 7. Open decisions for Avi

1. **Confirm the sequencing in §2** — ambient (free) → in-room facilitation (the real build) →
   everything else on signal. Overridable if a different job is more urgent than the business plan
   assumes.
2. **Where does the Board/Remote live: `apps/website` or `apps/app`?** This doc leans
   `apps/website` for v1 — it ships fastest, reuses `/play`'s existing infra most directly, and the
   v1 Remote is deliberately anonymous/authless (no RBAC needed), which matches where it's used
   today, not where auth lives. But `apps/app` is explicitly ADR-0008's home for "everything
   authenticated/stateful," and the cockpit-as-controller endgame (§4) lives there — so there's a
   real argument for building the `facilitationSession` table in `apps/app/src/server/db/schema.ts`
   (alongside #214's future tables) from day one rather than `apps/website/src/server/db/schema.ts`
   (today's home for `answer`, `conference`, etc.), even while the router itself starts
   website-mounted per ADR-0002. Needs a call once the app-foundation split (#215) has landed and
   settled.
3. **Is the plain anonymous Remote worth building at all**, given the moderation cockpit (#214) is
   already being scaffolded in parallel? The trade-off is days-to-ship-something vs. waiting for
   the cockpit and making it the only controller from day one. This doc's default is "build the
   cheap anonymous path now, let the cockpit become an additional/richer controller later" — but
   that's a real sequencing call, not an obvious one.
4. **Room-code UX: text-only, or add a QR code?** A QR code needs a small new encoding dependency;
   this doc's default is text-only for v1, add QR only if an actual in-room test shows people
   fumbling to type a 5-character code on their phone (unlikely, but untested).
5. **Bless or override the Facilitation Mode framing in §3** — that it's a hosted-session wrapper
   over the existing Global/Personal Game, not a fourth Game. `CONTEXT.md` flags this relationship
   as "not yet decided"; this doc proposes an answer but doesn't get to unilaterally decide it.
6. **What counts as "signal" for a native Apple TV app** — a specific customer asking for
   store/MDM-managed distribution, ambient usage growing enough that "a browser tab someone has to
   remember to reopen" becomes an operational complaint, or something else? Worth naming a concrete
   trigger now rather than deciding it in the moment.
