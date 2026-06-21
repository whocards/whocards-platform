# Repo: push to GitHub + deploy the monorepo to Netlify

**Tags:** repo, ci, deploy, infra
**Surfaces:** repo, web (`apps/website`)
**Status:** open (not started). Raised 2026-06-21.

## Context

The repo is **local only** (no git remote — flagged throughout recent work). The website uses
the Astro **Netlify adapter** (`astro.config.ts` → `adapter: netlify()`) and `IS_PROD` keys off
`NETLIFY`, but there's no connected GitHub repo or Netlify project building from this monorepo.
This is the foundation for the website deploy AND for the mobile API the app depends on
(`https://whocards.cc/api/trpc`, ADR-0005).

## Goal

`apps/website` builds and deploys to Netlify from this monorepo on push, with the GitHub repo as
the source of truth.

## Approach

1. **GitHub**: create the remote (org-owned), push `main`, set branch protection.
2. **Netlify**: connect the repo; configure a **monorepo build** — base/package dir `apps/website`,
   build via turbo/pnpm (`pnpm install` at root + `turbo build --filter=website`), publish the
   Astro/Netlify output. Add a `netlify.toml` if base-dir config needs it.
3. **Env**: set the website's secrets in Netlify (`DB_URL`, PostHog keys, Stripe, etc. per
   `env-secrets.ts`) — never in the repo.
4. **pnpm workspace** on Netlify: ensure the workspace + version catalog resolve in CI (pnpm
   version pinned via `packageManager`).
5. Confirm `whocards.cc` points at this Netlify deploy and serves `/api/trpc` (ties to ADR-0005 + #0021).

## Acceptance

- Push to `main` → Netlify builds `apps/website` from the monorepo and deploys.
- `https://whocards.cc/api/trpc` is live (unblocks the mobile prod API).

## Notes / out of scope

- Mobile (EAS) CI is separate (#0016). This ticket is the web deploy + the git remote everything else assumed.
- Coordinate with the planned Astro→TanStack migration (ADR-0002) so the deploy target is clear.

## References

- `apps/website/astro.config.ts` (Netlify adapter), `src/env-secrets.ts`, `pnpm-workspace.yaml`, `turbo.json`, ADR-0005
