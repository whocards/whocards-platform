# Mobile root error boundary

**Tags:** mobile, release, resilience
**Surfaces:** mobile (`apps/mobile`)
**Status:** **DONE** (`827427b`; merged to `main`). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

There's no error boundary: an unhandled render throw = a permanent white/blank screen with no
recovery. Required before the first beta build (RELEASE.md Phase 1).

## Goal

A render error shows a branded fallback with a retry, and the error is logged through
`@whocards/logger` (which routes to PostHog in prod once #0004 lands).

## Approach

1. New `src/components/error-boundary.tsx` — a class component (error boundaries must be classes)
   with `componentDidCatch` → `logError(...)`, rendering a `ScreenBackground` fallback ("Something
   went wrong" + a Try again button that resets the boundary).
2. Wrap the `Stack` in `src/app/_layout.tsx` with it (inside `GestureHandlerRootView`).
3. Keep the fallback dependency-light so it can't itself throw.

## Acceptance

- A thrown error in a screen renders the fallback (not a white screen) and `logError` fires.
- Retry re-mounts the tree.
- `pnpm --filter mobile typecheck` + lint clean.

## Notes / out of scope

- This catches JS render errors only; native crashes are out of scope (PostHog/#0004 covers JS errors; Sentry deferred per ADR-0005).

## References

- ADR-0005, docs/RELEASE.md (Phase 1), `src/app/_layout.tsx`, `@whocards/logger`
