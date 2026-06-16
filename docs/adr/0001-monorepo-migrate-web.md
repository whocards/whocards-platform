# Monorepo, with the website migrated in

**Status:** accepted

We are building the WhoCards mobile app and future API inside a new Turborepo + pnpm-workspaces monorepo (`apps/*`, `packages/*`, `tooling/*`, version catalog, `@whocards/*` internal packages), modelled on the vionlabs setup. The existing Astro website migrates into it as `apps/app`; shared content and design tokens move into `packages/decks` and `packages/tokens` so web, mobile, and the API consume one source of truth.

## Considered Options

- **Fresh monorepo, migrate web in (chosen).** Clean structure from day one; the mobile MVP can be built against extracted packages without disturbing the website's current (dirty) branch.
- **Restructure the existing repo in-place.** Preserves git history but mutates a live, mid-feature repo and front-loads the whole migration before any mobile code ships.
- **Separate repos, no sharing.** Fastest to start but duplicates the Pool/engine and guarantees drift between web and mobile.

## Consequences

The mobile MVP (Milestone 0) needs only `packages/decks` + `packages/tokens` + `apps/mobile`; the website migration into `apps/app` is decoupled and happens in Milestone 1.
