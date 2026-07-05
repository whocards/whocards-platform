# WhoCards @ Work — the Chat / Async Surface (Slack, Discord, Teams)

Date: 2026-07-05 · Status: research + recommendation, Slack POC spiked, no production code shipped ·
Issue: #179 · Epic: #201 ("WhoCards @ Work platform")

_Builds on `docs/spikes/0002-messaging-platform-bots.md` (framework research, merged via PR #185)
and cross-references the sibling surface doc `docs/spikes/0001-video-call-plugins.md` (#180). Reads
against `docs/strategy/ai-at-work-business-plan.md` §12–13 and `docs/adr/0008-authenticated-app-on-tanstack-start.md`
— **both currently live only on branch `feat/whocards-app-foundation` / draft PR #215, not yet on
`main`** at the time of writing. This doc is branched from `origin/main` per instruction, so it
necessarily references sibling work still in flight; treat every `apps/app` reference below as "once
#215 merges," not "today." Nothing here depends on merging #215 to be true or useful — see the
phasing in §3._

> **One-line reframe** (from issue #179's own latest comment, 2026-07-04): chat is not a standalone
> bot bet. It's **the async pulse surface** of the WhoCards @ Work moderation platform — the one
> surface that doesn't need anyone in the room. Slack/Discord/Teams is where a team submits to an AI
> check-in **over days**, driven by the same moderation cockpit + RBAC as the rest of the platform,
> and gets **a recap** back. Business plan §12 names six surfaces sharing one cockpit:

| Surface                        | Epic                | Role                                             |
| ------------------------------ | ------------------- | ------------------------------------------------ |
| Mobile / web `<Play>`          | shipped             | self-serve + PLG                                 |
| TV / shared screen             | new                 | in-room facilitation + ambient + consumer wedge  |
| Video-call (question-in-call)  | #180                | remote/hybrid facilitation surface               |
| **Chat (Slack/Discord/Teams)** | **#179 (this doc)** | the **async** pulse surface — submit over a week |
| Events / QR                    | growth Lever 2      | live top-of-funnel                               |

---

## TL;DR

1. **Framework: still no cross-platform framework.** This confirms spike 0002 one day later —
   nothing material changed in 24 hours. Hand-roll a thin per-platform adapter over each platform's
   own boring HTTP primitives, reusing `packages/decks` for the draw. Re-evaluate Vercel's Chat SDK
   only once WhoCards wants real cross-platform interactivity (in-place redraw buttons, multi-step
   flows) — not before. See §2.
2. **Platform #1: Slack**, unchanged from spike 0002 — best serverless fit, best cultural match for
   the AI-at-work B2B audience this whole platform is chasing.
3. **What's genuinely new since spike 0002 (written 2026-07-03):** `apps/app` (ADR-0008) now exists
   as the home of auth, RBAC, org accounts, and the question-review tool — the closest thing this
   repo has to "the moderation cockpit" today. That shifts the _hosting_ answer (not the framework
   answer): once #215 merges, a Slack workspace install is a natural `appOrganization`, and the
   existing `facilitator+` RBAC gate is the right check for "who can start/see a check-in." See §4.
4. **The hard part isn't the bot, it's the response.** Every existing WhoCards surface only ever
   records _which_ question was drawn (`AnswerEvent` — deck/question/language, see
   `packages/decks/src/contract.ts`). None of them capture _what someone said_ — because in the app,
   a card is a prompt for a live conversation, not a form. A chat check-in's entire value (the
   recap) depends on capturing free-text answers over days. That's new data, a new identity concept,
   and a small new agent — not a config tweak. See §5.
5. **A real correctness bug carried over from spike 0002's optimistic rendering plan:** it says "no
   new rendering code is needed," reusing the `/share-card` endpoint. That's only true for
   Pool-backed decks. The `ai-at-work` deck — the one the funnel most wants to push through the bot
   — is `source.kind: 'inline'`, which `packages/decks/src/types.ts`'s own `isPoolBacked` predicate
   says the Share Card endpoint must never be offered for (its ids either 404 or collide with
   unrelated Pool ids and silently render the _wrong_ card). v1 replies with **formatted text**, not
   an image. See §7.
6. **Spiked with this doc:** a stateless `/whocards [deck] [language]` Slack slash command —
   signature verification, a real draw via `@whocards/decks`, a Slack-shaped reply — behind an
   optional, env-gated `SLACK_SIGNING_SECRET`. No bot token, no DB, no install flow; it proves the
   technical loop end to end without taking on any of the async/capture complexity in §3 and §5. See
   §9.

---

## 1. Where this sits

Epic #201 reframes #179 (and #180) as **surfaces of one platform**, not standalone bets: one
moderation/facilitation cockpit, RBAC, and org accounts underneath everything. Business plan §12(a)
names three jobs the cockpit does — productize the human facilitation service, make the product
enterprise-buyable (anonymous submission, controlled reveal, consent, retention, safety flags =
"psychological safety productized"), and feed the data asset (the recap → an aggregate benchmark,
§13.3). §13.1 goes further and names the **"Managed AI Pulse retainer"** as the nearest-term new
revenue model this platform unlocks beyond the Tier 0–4 ladder — "the cockpit + async chat surface
(#179) make it deliverable at scale." Chat isn't a nice-to-have distribution channel here; it's
named as infrastructure for a specific, ranked-#1 new business model.

Concretely, "the same moderation model" this doc keeps referring to is `apps/app`'s (unmerged)
schema: `appOrganization`/`appMember` (RBAC, roles `owner > admin > facilitator > reviewer > member`,
`apps/app/src/server/auth/permissions.ts`) and `questionReview`/`questionComment`/`questionVote`/
`agentMessage` (`apps/app/src/server/db/schema.ts`) — today scoped to _WhoCards' own_ internal
question-variant review, via a single `ensureDefaultOrganization()` (`apps/app/src/server/trpc/
routers/people.ts`), not yet multi-tenant. That single-org limitation matters for sequencing (§3).

---

## 2. Framework decision (recap + what changed)

Spike 0002 (2026-07-03, merged) already did the primary research the epic asked for, thoroughly and
well-cited: Microsoft's Bot Framework SDK is archived and multi-tenant bot creation is deprecated;
Vercel's `chat` SDK (`vercel/chat`) is real and actively maintained but six months old and
opinionated (built for streaming AI replies and native interactive cards — capability WhoCards' v1
doesn't need); the credible answer is a **thin per-platform adapter**, hand-rolled, over each
platform's own small/boring/stable HTTP primitives (Slack's signed HTTP payloads, Discord's
Ed25519-signed interactions, Teams' Bot Framework Connector JSON) — the same shape as this repo's
existing `apps/website/src/pages/api/webhooks/resend.ts` (raw-body read, header signature check,
typed dispatch). Nothing in the 24 hours since has changed that calculus, and this doc doesn't
re-derive it — read spike 0002 for the full per-platform review/hosting/pricing comparison.

**What this doc adds:** the _host_ changes, not the framework verdict. Spike 0002 recommended
shipping "as a Netlify Function inside `apps/website`" because that was the only server surface
this repo had. `apps/app` (TanStack Start + Nitro, also Netlify-hosted, per ADR-0008) now exists and
owns the org/RBAC/moderation model the epic wants chat tied to. TanStack Start's file-route server
handlers (`apps/app/src/routes/api/auth/$.ts`, `apps/app/src/routes/api/trpc/$.ts` — both
`createFileRoute(...).server.handlers` returning a raw `Response`) are exactly as capable of a
signature-verified webhook as an Astro API route is — so hosting the real Slack integration in
`apps/app` instead of `apps/website` costs nothing technically and buys the RBAC/org tie-in for
free. See §4 for the concrete sequencing (this only applies once #215 merges).

**Recommendation, restated:** no cross-platform framework; thin adapters; Slack first; host in
`apps/app` once it exists, `apps/website` as a pre-merge stopgap. Re-evaluate Vercel's Chat SDK if a
later iteration wants real interactivity across more than one platform at once — track its maturity,
don't adopt on spec.

---

## 3. The async check-in — phased, because "the bot" is not one build

The business plan's own framing — "a team submits to an AI check-in over days, then gets a recap" —
is materially different from "run `/whocards` live in a meeting" (that's closer to the TV/video-call
surfaces). Designing straight to the full async ritual in one shot would be a large, DB-and-agent-
heavy build before anything is validated. Split it:

### Phase 0 — Stateless pilot (spiked with this doc, §9)

One hardcoded test workspace (Avi's own). `/whocards [deck] [language]` slash command: verify the
signed request, draw fresh via `@whocards/decks` (no persisted state), reply synchronously in the
same HTTP response. No bot token, no OAuth, no DB. Proves the technical loop only. Lives in
`apps/website` — the only sane host today, since `apps/app` isn't merged.

### Phase 1 — Real v1 bot (next issue, per spike 0002's own first proposal)

OAuth "Add to Slack" install flow → a stored install row (team id, bot token, installed-by,
timezone). The slash command now checks/updates _persisted_ per-channel draw history so the
non-repeating shuffle (`packages/decks/src/engine/nav.ts`) is genuinely non-repeating per channel,
not just per-invocation. Still synchronous, still no scheduling, still no response capture — this
is "the funnel hook works for any workspace," not yet "the ritual." **Host:** `apps/app` if #215 has
merged by the time this is built (the install row becomes an `appOrganization`); `apps/website`
otherwise, flagged explicitly as tech debt to migrate, not left to drift.

### Phase 2 — The ritual (scheduled posts)

A facilitator starts a check-in — deck, cadence (`daily` / `weekdays`), length (N questions),
channel, timezone. A Netlify Scheduled Function (cron; a first-class, already-available Netlify
feature this repo has never used yet — genuinely new infra, but no new provider) iterates active
check-ins due for their next post and calls Slack's `chat.postMessage` with the stored bot token.
Still **no response capture** — this phase exists to validate the cadence/UX cheaply ("does a
question-a-day in Slack read as a ritual or as spam?") before building the materially bigger
response-capture-and-recap machinery below.

### Phase 3 — Response capture + recap (the actual product)

This is where the design has to get genuinely new — nothing here is "reuse an existing piece":

- **Identity.** A chat responder isn't a **Device** (`CONTEXT.md`: "a single app install or browser,
  identified by a stable anonymous id... not a person"). Proposal: mint a Device row per
  `(platform, externalTeamId, externalUserId)` the first time someone responds, so chat answers flow
  into the _same_ Answer record and `questions_answered`/`games_played` counters every other surface
  already feeds — and so a future "claim your Device history into an account" flow (which
  `CONTEXT.md` explicitly designs Device to support, though it isn't built anywhere yet) covers chat
  for free instead of needing its own parallel claim mechanism. Flag this for a second opinion before
  building it — Device's current shape was written against app/web clients; nobody has checked its
  assumptions hold for an externally-issued platform identity.
- **Capture path — a real, unresolved fork:**
  - **(a) Thread replies.** Simplest to build (`channels:history`/`groups:history` scopes, Slack
    Events API) but _public to the whole channel_ — weak psychological safety, the opposite of
    business plan §12(a)'s pitch.
  - **(b) DMs to the bot.** Real anonymity, but needs `im:history` scope and a correlation story
    (_which_ check-in is this DM answering, if the person is in more than one workspace/channel
    running one) — a materially bigger Events API build than (a).
  - **(c) Hybrid.** Default to DM, offer "share in thread" as an explicit opt-in. Best match for
    what the business plan is actually selling; most work.
  - **Recommendation:** pilot with (a) to validate the ritual UX cheaply, but do **not** market the
    "anonymous / psychologically safe" pitch on top of (a) alone — that claim needs (b) or (c) before
    it's the enterprise-buyable thing §12(a) describes. This is a product call, not an engineering
    one; see the open decisions in §11.
- **The recap.** A small new agent, reusing the exact raw-`fetch` Anthropic Messages API pattern
  already proven twice in this repo (`apps/app/src/server/agent/anthropic.ts`'s `askAgent`, itself
  mirroring the unmerged Question Lab) — no new SDK dependency. Fed the check-in's collected raw
  responses, prompted to synthesize themes **without** attributing lines to individuals and to flag
  anything safety-relevant for a human, gated the same `ANTHROPIC_API_KEY`-optional,
  degrade-if-absent way as the existing discussion agent. Output posted back to the channel or DM'd
  to the facilitator — this is the "what the team surfaced" recap view the business plan names as
  Tier 2's manager-facing payoff (§9 of the business plan).
- **Cockpit tie-in.** Once `apps/app`'s org model goes real multi-tenant (Tier 2 — it is currently
  one hardcoded default org), a chat install's `organizationId` should point at a real
  `appOrganization`, and any view of raw (pre-recap) responses — if that's ever exposed at all,
  versus recap-only — should be gated the same `facilitator+` way `question_review` already is.
  **Until then, there is no real cockpit to plug into:** Phase 3 has to stand alone with its own
  minimal "post the recap to Slack" output, not a cockpit view that doesn't exist yet.

### Phase 4 — Second/third platform

Discord next only if social/community demand actually shows up — spike 0002's own read stands:
Discord is the weakest fit for "workplace ritual" despite being the easiest integration. Teams
third, gated on someone actually asking (a new Azure account + Entra ID app registration is a real
dependency this stack doesn't have today, priced in detail in spike 0002 §2). Re-evaluate Vercel's
Chat SDK at that point, not before.

---

## 4. Install / auth model

**Slack app manifest** (committable as `slack-manifest.yml` once Phase 1 starts — Slack supports
defining an app from a versioned manifest, so the app's config lives in git like everything else
here, not only in Slack's dashboard):

- **Slash command:** `/whocards`, Request URL → the command endpoint.
- **Bot token scopes, by phase:** `commands` (Phase 0–1) → add `chat:write` once the bot posts
  proactively (Phase 2 scheduled posts) → add `channels:history`/`groups:history` (Phase 3a, thread
  capture) or `im:history`/`im:write` (Phase 3b, DM capture). Add scopes only when the phase that
  needs them ships — asking for `im:history` at Phase 1 install time for a feature that doesn't
  exist yet is exactly the kind of over-broad OAuth ask that slows enterprise security review later.
- **OAuth install (Phase 1+):** "Add to Slack" button → Slack's consent screen (single-workspace
  install, no Slack Marketplace review needed per spike 0002 §2) → `oauth.v2.access` token exchange
  → store `team.id` + bot token + installing user + default timezone.
- **Where it runs:** Phase 0 pilot → `apps/website` (`apps/website/src/pages/api/bots/slack/*`, this
  doc's spike). Phase 1+ → `apps/app` if merged by then (`apps/app/src/routes/api/slack/*`, a
  `createFileRoute` server-handler route exactly like the existing `api/auth/$` and `api/trpc/$`
  routes), else `apps/website` as a flagged stopgap.
- **Secrets, env-gated, optional (never build-required — this is a pilot, not a shipped feature):**
  `SLACK_SIGNING_SECRET` (Phase 0, spiked here), `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` (Phase 1
  OAuth), and per-workspace bot tokens (Phase 1+, stored in the DB, never in env/logs).
- **A genuinely new risk worth flagging now, not at Phase 1 crunch time:** once bot tokens are
  stored (Phase 1), this DB holds its **first credential** — every other table today holds content
  (question text, email, consent), not a secret that lets someone post as the bot into a customer's
  live Slack workspace if it leaks. That's a meaningfully higher stakes column than anything else in
  this schema and deserves a real answer (encryption at rest, access scoping, a revoke story) before
  Phase 1, not an afterthought.

---

## 5. Data model sketch (Phase 1–3, illustrative — not final)

| Table          | Key columns                                                                                                   | Purpose                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatInstall`  | `platform`, `externalTeamId`, `teamName`, `botToken`, `installedBy`, `timezone`, `organizationId?`            | One row per workspace install. `organizationId` is null until Tier 2 multi-tenant orgs exist (§3 Phase 3).                                            |
| `chatCheckIn`  | `installId`, `channelId`, `deckSlug`, `cadence`, `questionsPlanned`, `questionsPosted`, `status`, `startedBy` | One row per running/completed check-in ritual.                                                                                                        |
| `chatResponse` | `checkInId`, `questionId`, `externalUserId?`, `visibility` (`thread`/`dm`), `body`, `createdAt`               | One row per submitted free-text answer. `externalUserId` is null if the capture path (§3) is designed to be truly anonymous rather than pseudonymous. |
| `chatRecap`    | `checkInId`, `summaryText`, `generatedAt`                                                                     | The agent-synthesized recap, once per completed check-in.                                                                                             |

Styled to match the existing `question_review`/`question_comment`/`question_vote`/`agent_message`
convention in `apps/app/src/server/db/schema.ts` (serial ids, FK-based, a plain-text `status`
column rather than a pg enum so adding a status is a code change not a migration) — same shape,
new domain.

---

## 6. Rendering (the correction to spike 0002)

Spike 0002 §3 claims "no new rendering code is needed," pointing at the on-demand Share Card
endpoint (`GET /share-card/{size}/{language}/{id}.png`, ADR-0007,
`apps/website/src/server/card-image.ts`). That's true only for **Pool-backed** decks
(`source.kind: 'library'`) — `packages/decks/src/types.ts`'s own `isPoolBacked` predicate exists
specifically because an inline deck's ids "either don't exist [in the Pool] (404, e.g. ai-at-work's
`ai-3`) or collide with an unrelated Pool id and silently serve the WRONG image," and its doc comment
says callers **must** gate any Share Card offering on this predicate. `aiAtWorkDeck`
(`packages/decks/src/decks/ai-at-work.ts`) is `source.kind: 'inline'` — exactly the deck the funnel
most wants the bot to showcase, and exactly the one the existing image endpoint cannot safely serve
today.

**v1 recommendation:** reply with a formatted text block (Slack Block Kit `section` + `context`, as
spiked in §9) for every deck, unconditionally. Gate any future image reply on
`isPoolBacked(deck)` — never on a hardcoded slug list, per the type's own warning — so `library`
draws could get an image fast-follow while `ai-at-work` correctly keeps rendering text until a
deck-aware Share Card endpoint exists (ADR-0007 already names this as unbuilt future work; building
it is a prerequisite ticket against that ADR, not something this epic should build as a side effect).

---

## 7. Analytics

No server-side PostHog client exists in this repo today — only client SDKs (`posthog-js` in
`apps/website`, `posthog-react-native` in `apps/mobile`). A bot has no browser, so bot-sourced draws
need either a small `posthog-node` dependency or a raw HTTP `POST` to PostHog's `/capture/` endpoint
(simple enough to hand-roll, consistent with this doc's "no SDK where a fetch call suffices" theme)
— genuinely new, if small, infra. Tag bot-sourced events with a distinct `source` property (e.g.
`slack_bot`) on the same `deck_opened`/`question_shown`-shaped events `apps/website/src/components/
Play/Play.tsx` already emits, so bot engagement shows up in the same funnel
`docs/growth/03-growth-strategy.md` §4 describes instead of being invisible — this is the exact gap
spike 0002 §4 flagged and it's still open.

---

## 8. Out of scope for this doc

- Video-call surfaces (Zoom/Meet/Teams-in-call) — separate epic #180, separate doc
  (`docs/spikes/0001-video-call-plugins.md`).
- Public Slack Marketplace / Teams Store / Discord App Directory listing — not a v1 concern for any
  of the three platforms per spike 0002 §2; revisit once there's demand for public discovery beyond
  a pilot workspace.
- Discord and Teams builds — sequenced behind Slack per §3 Phase 4.
- Custom Deck (player-authored) support in the bot — the bot targets `library`/`ai-at-work` only;
  `CONTEXT.md`'s Custom Deck concept isn't wired into the engine's read-only registry path the bot
  uses, and Tier 2 custom decks aren't built yet either.

---

## 9. The spike shipped with this doc

Added, all env-gated and degrading cleanly when unconfigured:

- `apps/website/src/server/slack/verify.ts` — `verifySlackSignature`, a pure function implementing
  Slack's documented request-signing scheme (`v0={hmac_sha256(secret, "v0:{timestamp}:{body}")}`)
  directly against Node's `crypto`, with the 5-minute replay-window check Slack's own docs
  recommend. No Slack SDK dependency — same "hand-roll the one HMAC check" call spike 0002 made for
  every platform, and the same shape as `verifyResendSignature` in
  `apps/website/src/server/resend-webhook.ts` (that one uses the `svix` package because Svix, not
  Resend, owns that signing format; Slack's is simple enough to not need one).
- `apps/website/src/server/slack/verify.test.ts` — unit tests: valid signature passes; tampered
  body, tampered signature, wrong secret, and a stale (>5 min) timestamp all fail.
- `apps/website/src/pages/api/bots/slack/command.ts` — the `/whocards [deck] [language]` slash
  command handler. Verifies the request, draws via `getDeck`/`getInitialNav` from `@whocards/decks`
  (the same pure engine web and mobile already use — no duplicated draw logic), and replies with a
  Slack Block Kit message (question text + a deep link to `whocards.cc/play/{deck}?q={id}`) — text
  only, per §6. Falls back to an ephemeral "not configured yet" reply if `SLACK_SIGNING_SECRET` is
  unset, and 401s on a bad signature. No DB, no bot token — Slack's synchronous slash-command
  response is used directly, so there's nothing to ack-then-follow-up on yet (that need starts at
  Phase 1+, once a real network call enters the critical path).
- `apps/website/src/env.ts` / `.env.example` (both website-local and root) — added
  `SLACK_SIGNING_SECRET` as optional (mirrors `apps/app/src/server/env.ts`'s `optionalString`
  pattern: blank-string-as-undefined, `.optional()`, never build-required).

**How to try it:** create a Slack app in a personal/test workspace (api.slack.com/apps → From
scratch), add a slash command `/whocards` with the Request URL pointing at this endpoint, copy the
app's **Signing Secret** into `SLACK_SIGNING_SECRET`. This branch's Netlify deploy preview (once
pushed — `apps/website` is git-integrated for previews) gives a public URL to point the Request URL
at without a tunnel; for pure local dev, an `ngrok http` tunnel works too. No bot token, no OAuth,
no other setup.

---

## 10. Confidence

High: the framework-vs-native call (unchanged from spike 0002, re-checked, nothing material changed
in a day), the `isPoolBacked` rendering gotcha (read directly from `packages/decks/src/types.ts`'s
own doc comment — not an inference), and the spiked signature-verification code (tested against
Slack's publicly documented algorithm). Medium: "Slack first" (a product judgment about audience,
same caveat spike 0002 gave — worth Avi's gut-check, nothing new changes that call). Low / explicitly
open: the response-capture fork (§3 Phase 3, thread vs. DM vs. hybrid) and the Device-reuse proposal
for chat identity — both are real design decisions, not resolved by this research, listed in §11.

---

## 11. Open decisions for Avi

1. **Slack-first, still?** Nothing changed since spike 0002's gut-check ask — re-confirming, not
   re-litigating.
2. **Host in `apps/app` once #215 merges, or keep chat permanently in `apps/website`?**
   Recommend `apps/app` for the RBAC/org tie-in (§2, §4) — but this is a real "which app owns this"
   call, not purely technical.
3. **Response-capture model (§3 Phase 3):** thread replies (simple, public) vs. DM-first (anonymous,
   more complex) vs. hybrid. This is a product/positioning decision, not an engineering one — it
   decides whether the "psychological safety" pitch in business plan §12(a) is actually true of what
   ships.
4. **Chat identity: reuse Device, or a bespoke chat-only respondent table?** Recommend attempting
   Device-reuse (§3 Phase 3) but flagging it for a second look — nobody has checked whether Device's
   existing assumptions (written for app/web clients) hold for an externally-issued platform id.
5. **Recap-agent behavior:** how aggressive should anonymization/theme-synthesis be, should safety
   flags escalate to a human reviewer, how long are raw responses retained before/after the recap
   ships. Policy questions, not implementation details — needs Avi (or whoever owns the enterprise
   trust story) before Phase 3 is built, not after.
6. **Sequencing vs. Tier 2 multi-tenancy:** ship the Phase 0–2 pilot now (needs no multi-tenant org
   model at all — a single hardcoded pilot workspace, exactly as spike 0002's own first proposed
   child issue scoped it), or block chat entirely on Tier 2 org work landing first? Recommend: don't
   block — Phase 0–2 validates the ritual/cadence UX independent of the org model; only Phase 3's
   cockpit tie-in genuinely needs multi-tenant orgs to exist.
7. **Credential storage (§4):** this is the first credential-bearing table in the WhoCards DB. Needs
   a real answer (encryption at rest, access scoping) before Phase 1 OAuth ships, budgeted as its own
   small piece of work rather than an afterthought bolted onto the install-flow ticket.

---

## 12. Proposed follow-up issues

_(Not filed — listed for the owner to pick from, same convention as spikes 0001/0002.)_

1. **Phase 1: OAuth install + persisted per-channel draw state** — the funnel hook that works for
   any workspace, not just a hardcoded pilot. Depends on this doc's Phase 0 spike existing (done).
2. **Phase 2: Netlify Scheduled Function + check-in cadence** — the ritual itself (post a question a
   day/weekday), no response capture yet. Depends on #1.
3. **Phase 3a: thread-reply capture + recap agent (pilot anonymity)** — validates the ritual UX with
   real responses and a real recap, using the simpler (weaker-anonymity) capture path. Depends on #2
   and open decision #3.
4. **Phase 3b: DM-based capture (real anonymity)** — the version of #3a business plan §12(a) is
   actually pitching as enterprise-buyable. Depends on #3a validating the ritual is worth the bigger
   build.
5. **Credential storage hardening** — encryption-at-rest / access story for stored bot tokens, before
   Phase 1 ships tokens into the DB for the first time. Depends on open decision #7.
6. **Cockpit tie-in: chat installs → real `appOrganization`** — once Tier 2 multi-tenant orgs exist
   in `apps/app`, map installs onto them and gate raw-response visibility (if ever exposed) the same
   `facilitator+` way `question_review` already is.
7. **PostHog: bot-sourced draws as a distinct source** — same ask spike 0002 §4 already made, still
   open; needs a `posthog-node` (or raw-`fetch`) capture call since no server-side PostHog client
   exists in this repo yet.
8. **Discord / Teams (Phase 4)** — only once demand exists; same draw/render/schedule shape as
   Slack, per spike 0002's own sequencing and cost breakdown.
