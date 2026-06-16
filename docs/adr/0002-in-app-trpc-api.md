# API is an in-app tRPC router, not a standalone service

**Status:** accepted

The API the mobile app calls is a host-agnostic tRPC router living in `packages/api`, **mounted by `apps/app`** rather than deployed as its own service. During the Astro phase it is served from an Astro endpoint (`/api/trpc/[trpc]`); when `apps/app` migrates from Astro to TanStack Start, the same router is re-mounted by the new host. Mobile consumes it via `@trpc/client` for end-to-end types with no codegen; deck/manifest queries are exposed over GET with `Cache-Control`/`ETag` so read-only content stays edge-cacheable.

## Considered Options

- **In-app tRPC router (chosen).** One typed surface for content now and auth/purchases/custom-decks later; survives the framework swap because the logic lives in a package, not the host.
- **Standalone Fastify/REST service (`apps/api`).** Matches the vionlabs `public-api` pattern and is trivially cacheable, but it is aimed at external consumers; the mobile app is a first-party, all-TS client where that boilerplate buys little.
- **Plain REST routes in `apps/app`.** Simple for read-only content but loses end-to-end types and needs re-plumbing for authed mutations.

## Notes

The initial framing was "make API calls a separate app." That reversed during design to "part of `apps/app`" — recorded here so a future reader doesn't reintroduce a separate service expecting it was the original intent.
