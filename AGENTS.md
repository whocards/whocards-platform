# WhoCards — agent handbook

WhoCards is a conversation game: curated questions on Cards, played on the web, in the Expo app and in hosted workshop games. This file adds to the factory handbook and names this repo's exceptions. Read it before building here.

## Words

[CONTEXT.md](CONTEXT.md) is the glossary: Question, Card, Deck, Library, Pool, Game, Hosted Game, Round, Pair, Turn, Response and the rest. Use its words in code, tickets and copy, and the words it says to avoid nowhere.

## Layout

- `apps/website`: Astro marketing and play site on Netlify (site `whocards-calmly`, base dir `apps/website`).
- `apps/app`: WhoCards @ Work, TanStack Start + Better Auth on Netlify (site `whocards-app`, base dir `apps/app`) at app.whocards.cc.
- `apps/mobile`: Expo app, shipped through EAS.
- `apps/emails`: React Email templates and the guarded Resend helpers.
- `packages/*`: `@whocards/*` source packages (`decks`, `game`, `env`, `tokens`, ...), consumed via `workspace:*`.

## Where state lives

- **Databases:** prod is Supabase Postgres; its URL is only in `.env.prod` and Netlify's production context. Netlify previews and branch deploys share the Neon `preview` branch. Local dev and worktrees use a local Docker Postgres (`.env`). Never point anything but production at the prod URL.
- **Env:** one root `.env`, loaded by each app's `with-env` script; `ENV=prod pnpm …` swaps in `.env.prod`. The schemas are `packages/env` (one entry point per app). See [docs/agents/local-dev.md](docs/agents/local-dev.md).
- **Schema changes:** Drizzle `db:push`, no migration files. Each app's `drizzle.config.ts` loads both apps' schemas, because they share one database and push drops any table it can't see. Prod is pushed by hand (`ENV=prod pnpm --filter app db:push`), never by a deploy; read the statements it prints before confirming.
- **Content:** decks and the Pool are in `packages/decks`; strategy, growth and pricing docs are in the private `whocards/whocards` repo, never here (this repo is public).

## Decisions not to undo

The ADRs in [docs/adr](docs/adr) are settled; open a ticket before working against one. In short:

- No shared UI layer between web and mobile (ADR-0003); tokens are shared, components are not.
- Share Cards render on demand (ADR-0007); the app is TanStack Start, not Astro (ADR-0008).
- The app is invite-only: magic links and Google sign in existing users only, and an email goes out only to an existing user. People are added from the People page.
- Event routes carry a year: `/events/sdd-2026`, never `/events/sdd`.
- The mobile app icon is dark-only on purpose.

## Exceptions to the factory handbook

- **Merging:** squash, as the factory handbook says. Factory PRs auto-merge once green and through quality control, app changes included. Schema changes open with auto-merge off (`schemaChanges: pr`), because prod is pushed by a person.
- **Releases are never an agent's:** a `v*` tag runs a real store build and submit (`mobile-release.yml`). Don't tag, run `pnpm release`, or touch EAS credentials.
- **Tickets:** factory paperwork (claims, memos, odd jobs boxes) is fine. Any other new ticket or label is proposed to Avi first, never filed unasked.
- **Visual changes need pixels:** a mobile or web change with a visual surface ships with a screenshot of the changed state in both themes; a new look for the Card or another brand surface is mocked for Avi before it is built.
- **Workflow files** are pushed over SSH (`git@github.com:whocards/whocards-platform.git`): the `gh` token has no `workflow` scope.

## Checks

`pnpm check` (oxfmt, oxlint, turbo typecheck and test) before every push. More in [docs/agents/testing.md](docs/agents/testing.md).
