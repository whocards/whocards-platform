# Evaluate migrating the data layer from Postgres to Convex

**Tags:** backend, data
**Surfaces:** backend (web + mobile only indirectly, via the tRPC surface)
**Status:** parked (not scheduled)

## Note

Placeholder to capture intent: explore moving the current Postgres + Drizzle setup
(`apps/website/src/server/db`, the planned `answer` table, conference tracking, purchases)
to **Convex**. Raised 2026-06-18; explicitly **out of scope** for the current
unify-app-and-website + Answer-record work.

To flesh out when picked up: motivation (realtime, reactive queries, less backend glue?),
what moves (schema, the `answers.record` write path, tRPC vs Convex functions), migration
path for existing data, and impact on ADR-0002 (in-app tRPC router) and ADR-0004
(Global Game progress overlay — its counters would become reactive Convex queries).
