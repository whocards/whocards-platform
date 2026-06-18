# Logging wrapper package — errors to PostHog in prod, console in dev

**Tags:** tooling, observability
**Surfaces:** shared (package) · web · mobile
**Status:** shared + web + mobile-console-swap **DONE** (merged to `main`, commit `f3ec037`) ·
mobile PostHog transport **deferred**

> **Shipped (f3ec037):** `@whocards/logger` package (dev→console / prod→injected sink, never
> throws, PII-safe); web sink wired to `window.posthog?.captureException` (Error) /
> `capture('app_log', …)` (no Error) at `PostHog.astro` init, plus the two `offline-queue.ts`
> `console.warn`→`logError`/`logWarn` swaps; mobile `answer-queue.ts` `console.warn`→`logWarn` with
> the `eslint-disable no-console` dropped, and `configureLogger({dev: __DEV__})` at app root
> (console-in-dev / no-op-in-prod).
>
> **Deferred remainder:** the mobile PostHog **transport** — add `posthog-react-native` + a provider
> and inject a real sink so mobile errors reach PostHog in prod. Needs a dev-client rebuild
> (native dep) = user/device. Package API is unchanged when this lands.

## Context

Ticket 0003 introduced raw `console.warn` calls to surface Answer-queue send failures —
`apps/website/src/lib/offline-queue.ts` (×2) and `apps/mobile/src/lib/answer-queue.ts` (×1,
behind an `eslint-disable no-console`). Bare `console` in shipped code means failures vanish
in production with no visibility, and it trips the `no-console` lint rule on mobile.

We want one small logging path: **`console` in dev, PostHog in prod.** PostHog is already the
analytics sink — so route errors/warnings to it (`captureException` / an error event) instead
of the console when running in production.

**What exists today:**

- **Web** — `posthog-js` is wired: `apps/website/src/components/PostHog.astro` inits it and
  sets `window.posthog`; `Play.tsx` already calls `window.posthog?.capture(...)`. Env:
  `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` (`env-secrets.ts`).
- **Mobile** — **no PostHog at all** (no `posthog-react-native` dep, no init). This is the
  main net-new work: the mobile sink needs PostHog added and initialized first.

## Goal

A tiny shared package — `@whocards/logger` (or `@whocards/observability`) — exposing something
like `logError(message, error, context?)` and `logWarn(...)` that:

- in **dev** (`import.meta.env.DEV` / `__DEV__`) → `console`;
- in **prod** → the injected PostHog sink (`captureException` or a `$error` capture);
- never throws and never blocks (logging must not break play).

Keep it **platform-agnostic** (ADR-0003 spirit): the package owns the dev/prod routing and the
API; each app injects its own PostHog transport (web `window.posthog`, mobile
`posthog-react-native`). No `posthog-js` import inside the shared package.

## Scope by surface

### SHARED (`packages/logger`)

- New package: `logError` / `logWarn` API, dev→console / prod→injected `captureException`-style
  sink, an env flag for dev/prod, and a `setSink(fn)` (or factory) the apps call once at startup.
  Unit-test the dev/prod routing with a fake sink.

### WEB (`apps/website`)

- Wire the sink to `window.posthog?.captureException` (confirm the `posthog-js` error API) at
  init (near `PostHog.astro`). Replace the two `console.warn` in `offline-queue.ts`.

### MOBILE (`apps/mobile`)

- Add + initialize **`posthog-react-native`** (net-new dep + provider). Wire the sink. Replace
  the `console.warn` in `answer-queue.ts` and **drop the `eslint-disable no-console`**.

## Notes / out of scope

- Could later centralize the existing analytics `capture(...)` events through the same package,
  but this ticket is scoped to **error/warn logging**, not the analytics events.
- **PII:** log ids and error messages only — never question text or anything beyond the Device
  id already in the Answer payload.
- Mobile PostHog init is the bulk of the effort; if it slips, the mobile sink can stay
  console-in-dev / no-op-in-prod until `posthog-react-native` lands, with the package API
  unchanged.
