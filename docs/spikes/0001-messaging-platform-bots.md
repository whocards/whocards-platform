# Spike 0001: messaging-platform bots (Slack / Discord / Teams) — Phase 1 research

Date: 2026-07-03
Status: Research complete, no code shipped
Epic: #179

## TL;DR

**Skip the cross-platform framework. Build a thin in-house adapter and ship Slack first.**
Microsoft's own Bot Framework SDK — the traditional "one SDK, many channels" answer — was
archived on 2026-01-05 and is no longer maintained
([microsoft/botframework-sdk#6693](https://github.com/microsoft/botframework-sdk/issues/6693),
[Bot Service "what's new"](https://learn.microsoft.com/en-us/azure/bot-service/what-is-new?view=azure-bot-service-4.0)).
Its replacement for Teams work is Microsoft's own **Teams SDK** — platform-specific, not
cross-platform. The one credible newcomer, Vercel's [Chat SDK](https://chat-sdk.dev/)
(`npm i chat`), is real and well-built, but it is six months old
([created 2025-12-22](https://github.com/vercel/chat)) and its abstraction buys WhoCards little:
our v1 surface is one slash command, one image, and one scheduled post — not enough shared
surface to justify depending on someone else's opinionated card/thread model for three platforms
that each already have a small, official, boring SDK. What _is_ genuinely shared across all three
platforms is not a library, it's already sitting in this repo: `packages/decks`' pure draw engine
and the on-demand Share Card renderer. A ~150-line adapter per platform, wired through
`apps/website`'s existing Netlify Functions + Postgres, is less code, less risk, and less
lock-in than either framework path.

Per-platform, the field narrows fast once you separate "install to one workspace/server/org for
a pilot" (instant, no review, on all three platforms) from "list publicly in an app
marketplace" (weeks of review, irrelevant until well past v1). **Slack** is the cleanest fit for
Netlify Functions (HTTP mode is explicitly the production-recommended path over Socket Mode) and
the best cultural fit for the AI-at-Work B2B wedge. **Discord** is the technically easiest of the
three (a pure HTTP interactions endpoint, no gateway, no OAuth-scope negotiation with an org
admin) but is the weakest fit for the "workplace ritual" framing the epic is built around.
**Teams** is real extra infra: even on the new, non-deprecated SDK, a bot still requires
registering an Azure Bot resource against an Entra ID app — an Azure account is mandatory
regardless of where the bot's code actually runs. That's a genuine new dependency outside this
stack, not a blocker, but a reason to go third.

## 1. Cross-platform frameworks vs. three thin native integrations

### Microsoft Bot Framework: the traditional answer is dead

The Bot Framework SDK and Bot Framework Emulator repos were archived and are no longer updated;
support tickets against the SDK stopped being serviced as of 2025-12-31
([microsoft/botframework-sdk#6693](https://github.com/microsoft/botframework-sdk/issues/6693)).
Multi-tenant bot _creation_ (the mode that let one bot registration serve many
organizations/workspaces — the whole point of a cross-platform bot) was deprecated after
2025-07-31; existing multi-tenant bots keep running, but nothing new can be built that way
([same thread](https://github.com/microsoft/botframework-sdk/issues/6693)). Microsoft's own
guidance for new work is to use the **Microsoft 365 Agents SDK** for general agent/channel work,
or the **Teams SDK** (formerly "Teams AI Library," GA in C#/JS as of 2026) for Teams specifically
([Microsoft 365 Dev Blog](https://devblogs.microsoft.com/microsoft365dev/announcing-the-updated-teams-ai-library-and-mcp-support/)).
Neither is a Slack/Discord adapter — they're Microsoft-ecosystem tools that happen to _also_
reach some other Bot Framework channels. For WhoCards' purposes, "Bot Framework as the one
framework for three platforms" is off the table in mid-2026; it was the obvious candidate two
years ago and isn't anymore.

### Vercel Chat SDK: real, but young and opinionated

[`vercel/chat`](https://github.com/vercel/chat) ("Chat SDK," `npm i chat`) is a genuine,
actively-maintained answer to "write bot logic once, deploy to Slack/Teams/Google
Chat/Discord/Telegram/WhatsApp/GitHub/Linear." Verified directly (not taking the marketing copy
on faith): MIT-licensed, 2,155 GitHub stars, 244 forks, created 2025-12-22, still pushing commits
the day this doc was written (2026-07-03), and genuinely popular on npm — 1.44M weekly downloads
as of the week of 2026-06-22
([npm registry](https://registry.npmjs.org/chat), [GitHub API](https://api.github.com/repos/vercel/chat)).
It exposes per-platform webhook handlers you wire into any HTTP framework (Next.js, Hono,
Express, or a bare route) — it is **not** Vercel-hosting-locked, and would run fine as a Netlify
Function the same way this repo already runs `/api/webhooks/resend` and
`/share-card/[size]/[language]/[id].png`
([Vercel's own docs describe it as framework-agnostic](https://vercel.com/kb/guide/the-complete-guide-to-chat-sdk)).
It claims slash commands, buttons/dropdowns, modals, reactions, and proactive `thread.post()`
sends across adapters.

The honest read: it's good, but it's a **six-month-old dependency from Vercel** for a product
whose actual v1 need — one slash command, one static image reply, one scheduled channel post —
doesn't touch the parts of Chat SDK that justify its existence (streaming AI responses, JSX
interactive cards rendered natively per platform, concurrent-message modes). Taking it on now
means inheriting its adapter release cadence and its opinions about state (its examples lean on
Redis) for a surface area WhoCards could hand-roll in an afternoon per platform using each
platform's own boring, stable primitives. Worth re-evaluating once WhoCards' bot actually needs
richer interactivity (buttons that change the drawn card in place, multi-turn flows) — at that
point the calculus flips and Chat SDK's abstraction starts paying for itself.

### The "per-platform thin library" pattern

Each target platform already has a small, official-or-near-official library that does only that
platform, well: Slack's own [Bolt for JavaScript](https://docs.slack.dev/tools/bolt-js/)
(`@slack/bolt`, currently 4.x), Discord's `discord-interactions` package for HTTP-mode bots (or
just `discord.js` if going gateway), and Microsoft's Teams SDK. The epic's other reference point,
**grammY**, is Telegram-only (not one of the three target platforms) but is the textbook example
of this pattern done well — small, single-platform, no shared-abstraction tax. That pattern is
what this doc recommends, minus even the per-platform library: Slack's HTTP payloads, Discord's
Ed25519-signed interactions, and Teams' Bot Framework Connector JSON are all just "verify a
signature, parse a small JSON body, reply with JSON or a follow-up POST" — close enough to what
`apps/website/src/pages/api/webhooks/resend.ts` already does (raw-body read, header-based
signature check, typed dispatch) that a hand-rolled adapter per platform is genuinely less code
than pulling in even a thin library, while drawing on `packages/decks` for the one piece of
logic that's actually shared.

### One candidate that doesn't fit the ask: Hookdeck

The epic also names Hookdeck as a pattern to evaluate. Investigated and ruled out: Hookdeck is a
**webhook gateway** (reliable ingestion, retries, replay, delivery observability for _inbound_
webhooks from things like Stripe/GitHub), and its Slack/Discord/Teams integration is only as an
**outbound alerting channel** for Hookdeck's own dashboard (e.g. "notify #incidents in Slack
when a webhook delivery fails") — [confirmed via Hookdeck's own
docs](https://hookdeck.com/docs/platform/event-gateway-projects) and changelog. It solves a
different problem (webhook reliability infrastructure) than the one this epic has (building a
bot that posts questions and takes slash commands). Netlify Functions' built-in retry/logging is
already sufficient at WhoCards' current traffic; revisit only if webhook delivery reliability
becomes an actual incident source.

### What survives abstraction, concretely

| Feature                   | Slack                                                         | Discord                                             | Teams                                                                                                                      | Shared across all three?                                                                              |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Slash commands            | Native (`/command`)                                           | Native (application commands)                       | Native (bot commands / message extensions)                                                                                 | Yes, but the registration/config shape differs enough that "shared" only means "conceptually similar" |
| Buttons / interactivity   | Block Kit interactive elements                                | Message components (buttons, selects)               | Adaptive Cards `Action.Submit`                                                                                             | Yes in concept; payload shapes are unrelated JSON                                                     |
| Scheduled/proactive posts | `chat.postMessage` with a bot token, any time                 | REST `POST` to a channel with a bot token, any time | Requires a stored conversation reference + proactive message via the Bot Framework Connector (a Teams-specific extra step) | Mostly — Teams is the odd one out                                                                     |
| Threads                   | Native, first-class                                           | Native ("thread" channel type)                      | Native (reply chains)                                                                                                      | Yes, loosely                                                                                          |
| Image unfurl / attachment | Direct image URL in a Block Kit `image` block, or link unfurl | Direct image URL in an embed                        | Adaptive Card `Image` element                                                                                              | Yes — all three just want a hosted image URL, which WhoCards already has (§3)                         |

## 2. Per-platform reality check

### Slack

- **Install UX for v1 (pilot/internal use):** a single-workspace app installs immediately via
  "Install App to Workspace" in the app's own settings — no Slack review at all. By default any
  workspace member can install an app unless a Workspace Owner has restricted app installation
  ([Slack help center](https://slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace),
  [app lifecycle docs](https://docs.slack.dev/app-management/distribution/)). Only apps _not_
  listed in the Slack Marketplace show a "not reviewed" banner — cosmetic, not a gate.
- **Public listing (Slack Marketplace), if pursued later:** preliminary review ~10 business days,
  functional review up to 10 weeks for a new submission (6 weeks for a resubmission of an
  already-published app) ([Slack's review-process FAQ](https://slack.com/blog/developers/slack-marketplace-review-process)).
  Not a v1 concern.
- **Hosting:** Slack explicitly recommends **HTTP mode over Socket Mode for production** — Socket
  Mode exists mainly to avoid a public URL during local development, and its long-lived WebSocket
  connection is harder to run on serverless
  ([Slack: Comparing HTTP & Socket Mode](https://docs.slack.dev/apis/events-api/comparing-http-socket-mode/)).
  HTTP mode is exactly what this repo already does for webhooks — fits Netlify Functions with no
  new infra. The catch is Slack's 3-second ack window: cold starts on a Netlify Function can eat
  into that budget, so the standard mitigation (ack immediately with `200`, do the real work, then
  respond via the interaction's `response_url`) is required, not optional. Bolt.js (the official
  JS framework) is explicit that serverless "is not officially supported," but it's a
  well-documented, widely-used pattern in practice, including existing Netlify-specific templates
  ([Bolt AWS Lambda deploy docs](https://tools.slack.dev/bolt-js/deployments/aws-lambda/), [a
  Netlify-Functions-plus-Bolt template repo](https://github.com/ClydeDz/netlify-functions-slack-javascript)).
  Given the "thin adapter, no framework" recommendation above, WhoCards likely doesn't even take
  Bolt as a dependency — a raw signed-request handler is simpler.
- **Pricing:** building and installing a Slack app is free regardless of the workspace's paid
  plan tier; nothing here gates a free-tier workspace from using slash commands or bot messages.
- **Scheduled ritual posts:** a Netlify Scheduled Function (cron-based, available on every Netlify
  plan, config lives in `netlify.toml` or an inline `config.schedule` export — [Netlify Scheduled
  Functions docs](https://docs.netlify.com/build/functions/scheduled-functions/)) calling Slack's
  `chat.postMessage` with a stored bot token is the whole mechanism. No new infra beyond Netlify.

### Discord

- **Install UX for v1:** an OAuth "Add to Server" link an admin clicks — instant, no review,
  gated only by the inviting admin's own server permissions. This is the lowest-friction install
  of the three.
- **Verification thresholds (irrelevant to v1, worth knowing for later):** bot (server-count)
  verification kicks in at 100 servers; the separate Privileged Intents review (needed only for
  reading raw message content, presence, or the member list) now kicks in at 10,000 _users_, not
  server count, as of a June 2026 policy change
  ([Discord dev support article](https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps)).
  A slash-command-only WhoCards bot never needs the Message Content intent at all, so this
  practically never applies.
- **Hosting:** Discord's **HTTP-only Interactions Endpoint** mode needs no gateway/WebSocket
  connection at all — Discord POSTs each slash-command invocation to a public URL, verified with
  an Ed25519 signature over the raw body ([Discord interactions overview](https://discord.com/developers/docs/interactions/overview)).
  This is, unambiguously, the best serverless fit of the three platforms and maps directly onto
  the raw-body-read-plus-signature-check shape already proven in
  `apps/website/src/pages/api/webhooks/resend.ts` (Svix HMAC there, Ed25519 here — same pattern,
  different crypto).
- **Pricing:** free.
- **Scheduled ritual posts:** a bot-token REST `POST` to a channel from a Netlify Scheduled
  Function, same shape as Slack's.

### Microsoft Teams

- **Install UX for v1:** an org admin can upload a custom app package (a manifest zip) directly
  into the org's app catalog with **no Teams Store review** — "sideloading," either admin-only or
  opened to end users via a setup policy
  ([Teams admin docs on custom app policies](https://learn.microsoft.com/en-us/microsoftteams/teams-custom-app-policies-and-settings)).
  Structurally the same "install to one org, skip the public store" path Slack and Discord offer.
- **Public Teams Store listing, if pursued later:** Microsoft's own validator returns an initial
  report in about 24 working hours, faster than Slack's review — but each round of "must-fix"
  issues requires a resubmission cycle, and it still routes through Partner Center/AppSource
  ([Teams Store validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines)).
- **Hosting — the real friction point:** regardless of SDK choice (old, archived Bot Framework
  SDK or the new Teams SDK), a Teams bot still requires registering an **Azure Bot resource** tied
  to a Microsoft Entra ID app registration; the bot's _code_ doesn't have to run on Azure, but the
  _registration_ is mandatory — there's no path to a Teams bot that skips having an Azure account
  ([Azure Bot Service registration docs](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-quickstart-registration?view=azure-bot-service-4.0)).
  That's a new external dependency outside this monorepo's current stack (no Azure account exists
  today) — not a hard blocker, but a genuine setup step Slack and Discord don't have.
- **Pricing:** the Azure Bot Service registration itself is free for the "standard" Teams channel;
  cost only appears with premium channels (~$0.50/1,000 messages) or if extra Azure compute is
  added, which WhoCards wouldn't need since the bot logic lives in Netlify Functions either way
  ([Azure Bot Service pricing](https://azure.microsoft.com/en-us/pricing/details/bot-services/)).
- **Scheduled ritual posts:** proactive messaging in Teams needs the conversation reference
  stored from the install event and sent through the Bot Framework Connector — one genuinely
  Teams-specific extra step compared to Slack/Discord's "just call the REST API with a token."

## 3. A concrete v1 shape for WhoCards

**Draws.** `packages/decks`' engine is already exactly what a bot needs and nothing more: pure
functions, no React, no DOM (`packages/decks/src/engine/nav.ts`,
`packages/decks/src/engine/pick.ts`, `packages/decks/src/engine/shuffle.ts`). `getDeck(slug)` /
`resolveDeck()` (`packages/decks/src/decks/registry.ts`) resolve a deck (e.g. `'library'` or
`'ai-at-work'`) into its ordered question ids and per-language text; `getInitialNav` /
`navReducer` (`packages/decks/src/engine/nav.ts`) implement the same non-repeating shuffle used
by web and mobile. `apps/website` already depends on `@whocards/decks` as a workspace package
(`apps/website/package.json`), so a bot handler under `apps/website/src/pages/api/bots/*` can
import these directly — no new engine code, no duplicated draw logic. The only new state is
_whose_ answered-set a channel/workspace draws against: CONTEXT.md's Global vs. Personal Game
split maps cleanly onto "one shared draw for the whole workspace" vs. "per-channel," and that
state (which ids a channel has already drawn) is a small new Postgres table alongside the
existing `apps/website/src/server/db` migrations (same pattern as `0001_email_consent.sql`).

**Rendering.** This is the pleasant surprise of the research: **no new rendering code is
needed.** ADR-0007 already put the Share Card renderer (`apps/website/src/server/card-image.ts`,
Satori → resvg) behind a public, CDN-cached, on-demand endpoint —
`GET /share-card/{size}/{language}/{id}.png` — specifically so any consumer (mobile, web, and now
a bot) can request a branded image for any (question, language) pair without re-implementing the
design. A bot's `/whocards` response is just: draw an id via `packages/decks`, then hand each
platform that image URL — a Slack Block Kit `image` block, a Discord embed `image`, or a Teams
Adaptive Card `Image` element — plus a deep link back to `whocards.cc/play/{deck}?q={id}` (or
the app, once Universal/App Links are live for the relevant path). The `post` size (4:5) is the
natural fit for a chat-width image; `story` (9:16) is unnecessary here.

**Command shape.** `/whocards [deck] [language]` → immediate ack, then post the drawn card as
described above. `deck` defaults to the Library; offering `ai-at-work` explicitly is the funnel
hook (§4). `language` defaults to the channel/workspace's stored preference (mirroring the
`languageStorageKey` Display-setting concept in `packages/decks/src/types.ts`) and falls back to
the deck's default language.

**Scheduled ritual posts.** A Netlify Scheduled Function, cron-driven, iterating installed
channels with a schedule set (e.g. weekdays 09:30 local) and calling the same draw-and-post path
as the slash command — no separate code path, just a different trigger. This is genuinely new
infra for this repo (no scheduled function exists today), but it's a documented, first-class
Netlify feature already available on the current plan, not a new service to stand up.

## 4. Fit with the AI-at-Work funnel

`docs/growth/03-growth-strategy.md` names the AI-at-Work B2B wedge (Lever 5) as "the most likely
first revenue" and Lever 1 (plug the retention bucket via identity capture) as the precondition
that gates everything else. A workplace bot is a natural distribution channel for exactly the
audience Lever 5 targets — a team already living in Slack or Teams can run
`/whocards ai-at-work` in their own channel instead of finding `/ai-at-work` on the web, which
removes friction but also _removes_ the landing page's email-capture form
(`apps/website/src/pages/api/ai-checkin-subscribe.ts`) from the path. That's a direct tension
with Lever 1: a bot install with no identity capture is acquisition without retention, the exact
failure mode the growth doc calls the "leaky bucket." The bot's response should still carry a
link back to `/ai-at-work` (or a bot-specific capture — e.g. "get the other 56 questions in your
inbox") so a bot-sourced conversation still feeds the same email-capture funnel the web page
does, rather than being a parallel, unmeasured channel. This is also why the later "Analytics"
phase in the epic (bot-sourced draws distinct from app/web in PostHog) matters as much as the
bot itself — without it, the bot's contribution to Lever 5 is invisible.

## 5. Recommendation

1. **No cross-platform framework.** Hand-roll a thin per-platform adapter (~100–200 lines each:
   signature verification, slash-command parsing, a reply) reusing `packages/decks` for the draw
   and the existing `/share-card` endpoint for the image. Re-evaluate Vercel's Chat SDK if/when
   the bot needs real interactivity (in-place redraw buttons, multi-step flows) that starts to
   justify its abstraction tax — not before.
2. **Platform #1: Slack.** Best serverless fit (HTTP mode is Slack's own recommended production
   path), zero new external infra (no Azure account needed, unlike Teams), and the best cultural
   match for the AI-at-Work B2B audience the growth strategy is actually chasing. Discord is
   technically the easiest integration but is the weakest fit for "workplace ritual"; save it for
   a later, more consumer/community-flavored pass if ever. Teams should come third — same
   sideload-for-pilot install UX as the other two, but only once someone actually asks for it
   (given the required Azure Bot Service registration is a new dependency this monorepo doesn't
   have today).
3. **Ship it as a Netlify Function inside `apps/website`,** the same host as every other
   server-side surface in this repo, not a separate service. The only genuinely new pieces of
   infra are a small Postgres table for per-channel install/schedule/language state and a Netlify
   Scheduled Function for ritual posts — both fit the existing stack with no new provider.

**Confidence:** high on the framework-vs-native call and the Netlify/`packages/decks`/Share-Card
reuse (all verified directly against this repo's code and current docs). Medium on "Slack first"
— that's a product judgment about where WhoCards' actual early adopters live (mostly informed by
the growth doc's B2B framing), not something with a citable source; worth a gut-check with Avi
before committing. Not independently verified: exact Netlify cold-start latency under Slack's
3-second budget in production (the mitigation pattern — ack-then-`response_url` — is standard
enough that this is unlikely to matter, but it wasn't load-tested here).

## Proposed child issues

_(Not filed — listed here for the owner to pick from.)_

**Pick platform #1 and ship a minimal Slack bot**
`/whocards [deck] [language]` slash command in a pilot Slack workspace: verify the signed
request, draw via `packages/decks`, reply with the `/share-card` `post`-size image plus a deep
link. No scheduling yet — proves the core loop end-to-end before adding ritual posts.

**Netlify Scheduled Function + per-channel install state**
A Postgres table (channel/workspace id, platform, deck, language, schedule, last-drawn id) plus
a cron-driven Scheduled Function that posts a ritual question to every installed channel on its
own schedule. Depends on the minimal bot above existing first.

**Bot install flow + secrets**
OAuth install ("Add to Slack"), token storage, and the env-schema wiring for bot secrets
(`apps/website/src/env.ts`, same build-required pattern as `RESEND_API_KEY`/
`TURNSTILE_SECRET_KEY`). Small on its own, but blocks anything beyond a single hardcoded pilot
workspace.

**PostHog: bot-sourced draws as a distinct source**
Tag bot-originated draws/answers separately from app/web in the Answer record and PostHog so
Lever 5 (AI-at-Work B2B) and the retention funnel can actually see whether the bot is
contributing net-new emails or just cannibalizing web landing-page traffic (§4 above).

**Re-evaluate Vercel Chat SDK once interactivity grows**
If a later iteration wants in-place redraw buttons, multi-step onboarding, or a second messaging
platform beyond Slack, revisit `vercel/chat` against what's shipped by then — track its maturity
(it was 6 months old at the time of this research) rather than adopting on spec now.

**Microsoft Teams bot (third platform, after demand exists)**
Same draw/render/schedule shape as Slack, gated on someone actually requesting Teams: needs a new
Azure account + Entra ID app registration + Azure Bot Service resource before any code work, none
of which exists in this stack today.
