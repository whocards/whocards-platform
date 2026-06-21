# Mobile app identity (display name, icon) + production API safety fallback

**Tags:** mobile, release, config
**Surfaces:** mobile (`apps/mobile`)
**Status:** **DONE** (`827427b`; merged to `main`). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

Two correctness gaps would ship a broken/unbranded build:

- `app.json` `name`/`slug` are `"mobile"` → the home-screen name shows **"mobile"**.
- `src/lib/trpc.ts` falls back to `localhost:4321` when `EXPO_PUBLIC_API_URL` is unset, so a
  production build missing the env would silently hit localhost. #0011 sets the env, but a
  code-level prod default is a cheap safety net.
- `ios.icon` points at `./assets/expo.icon` (the Expo default in Apple `.icon` format) — verify
  it's the WhoCards mark, not the placeholder.

## Goal

The installed app is named **WhoCards**, shows the brand icon, and can never hit localhost in a
non-dev build.

## Approach

1. `app.json`: set the user-facing `name` to "WhoCards" (keep bundle ids `cc.whocards.mobile`).
2. `app.json`: confirm `ios.icon` + the cross-platform `icon.png` render the WhoCards mark; fix if it's the Expo default.
3. `src/lib/trpc.ts`: when `EXPO_PUBLIC_API_URL` is unset, return `https://whocards.cc` in non-dev (`__DEV__ === false`) builds; keep the LAN/localhost fallback for dev only.

## Acceptance

- Home-screen label reads "WhoCards"; icon is on-brand.
- A release build with no env still resolves the API to `https://whocards.cc` (not localhost).
- `pnpm --filter mobile typecheck` + lint clean.

## Notes / out of scope

- The per-profile `EXPO_PUBLIC_API_URL` env is owned by #0011; this is the belt-and-suspenders default.

## References

- ADR-0005, docs/RELEASE.md (Phase 1), `app.json`, `src/lib/trpc.ts`
