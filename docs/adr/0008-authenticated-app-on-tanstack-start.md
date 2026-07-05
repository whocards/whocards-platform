# ADR-0008: The authenticated app runs on TanStack Start; Astro stays for content

Date: 2026-07-04
Status: Accepted

## Context

WhoCards is growing a second, different workload. The existing `apps/website` is a
content/marketing/SEO site — Astro's sweet spot: islands, ship-zero-JS, MDX, 14 languages, ~900
prerendered question pages, build-time OG generation. That content moat is growth Lever 3 and must
not be disturbed.

The new work (see `docs/strategy/ai-at-work-business-plan.md`) is **app-shaped**: authenticated,
stateful, multi-user, real-time-ish — a collaborative **question-review** tool, **RBAC** for
admins/facilitators, a **moderation cockpit**, and eventually **Tier 2 "WhoCards for Teams"**
(multi-tenant orgs, seats, roles). Astro's page-first + islands model fights this the moment shared
client state, optimistic writes, and live moderation appear.

Crucially, the app surface is **greenfield**. There is no authenticated app to migrate — the
`auth_*` (NextAuth) and `account_*` tables in `apps/website/src/server/db/schema.ts` are inert
leftovers from an abandoned Next.js version (ticket 0005's "AUTH DECISION PENDING"). So the platform
for the app can be chosen at ~zero migration cost.

## Decision

**Split by workload, don't switch wholesale.**

- **Astro remains the platform for `apps/website`** — marketing, SEO/AEO content, the multilingual
  question pages, OG cards. Unchanged.
- **New authenticated/stateful surfaces are built as a new `apps/app` on TanStack Start** (v1,
  Vite + Nitro), deployed to Netlify (same host), sharing the existing monorepo packages:
  `@whocards/api` (tRPC v11), the Drizzle/Postgres DB, `@whocards/decks`, `@whocards/tokens`.
  `@tanstack/react-query` and tRPC are already in the catalog.
- **Auth = better-auth** (Drizzle adapter, Postgres) with **magic-link (via the existing Resend
  infra)** + a **Google OAuth** provider (scaffolded; enabled when creds are provided). This
  **resolves ticket 0005**: the new better-auth tables are the surviving auth set; the legacy
  `auth_*`/`account_*` tables become drop candidates in a follow-up migration.
- **RBAC = better-auth roles/organization plugins.** Roles: `owner`, `admin`, `facilitator`,
  `reviewer`, `member`. Organizations model the future Tier 2 tenant.

## Considered options

- **Stay on Astro; build auth + app as SSR + React islands.** Lowest short-term risk (already
  deployed), but grows an app on a content framework; the moderation cockpit / Teams surfaces would
  likely be migrated later at real cost. Rejected as the long-term home.
- **Full switch to TanStack (migrate marketing too).** One framework, but a large rewrite that
  risks the ~900-page multilingual SEO moat for no gain. Astro is ahead of TanStack Start for a
  static multilingual content site. Rejected.
- **Return to Next.js (do both in one framework).** The team already migrated _off_ Next (ADR-0001,
  the NextAuth tables are the retire-candidates). Not revisiting.

## Consequences

- **Two app frameworks** (Astro + TanStack Start) alongside React Native mobile — acceptable: the
  repo already runs multiple frameworks over shared packages, and the split is along a clean
  content/app seam.
- **TanStack Start is younger** than Astro/Next (v1.0 shipped March 2026). Mitigated: it's built on
  production-grade Router/Query/Vite, Netlify-supported, and better-auth + Drizzle + RBAC is a
  paved, templated path.
- **The platform choice = the Tier 2 foundation.** better-auth's org + RBAC plugins are the
  multi-tenant seat/role layer "WhoCards for Teams" needs, so this build is not a detour.
- **One shared DB, two apps.** Both apps read the same Drizzle schema/Postgres; the app owns the new
  auth/review/moderation tables. Keep schema changes additive and migration-gated.
- The greenfield app is also the **de-risking evidence** for the platform question: a real,
  loginnable TanStack app to judge by using.
