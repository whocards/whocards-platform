# Mobile release infra: EAS Build/Submit, eas.json profiles, OTA, remote versioning

**Tags:** mobile, release, infra
**Surfaces:** mobile (`apps/mobile`)
**Status:** open (not started). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

The app has no release tooling: no `eas.json`, no EAS `projectId`, no OTA, no version
strategy. ADR-0005 settled the pipeline; this ticket stands up the EAS foundation.

## Goal

`eas build`/`submit`/`update` work for `apps/mobile` with the agreed profiles, OTA on a
fingerprint runtime version, and EAS-managed build numbers.

## Approach

1. `eas init` (needs the Expo account from #0012) → commit `extra.eas.projectId` to `app.json`.
2. `eas.json`: `cli.appVersionSource: "remote"`; profiles `development` (dev client),
   `preview` (internal, prod API), `production` (store, prod API, `autoIncrement`). Set
   per-profile `env.EXPO_PUBLIC_API_URL` — `https://whocards.cc` for preview/production.
3. OTA: add `expo-updates`; `app.json` `runtimeVersion: { "policy": "fingerprint" }`; channels
   `preview`/`production`; `eas update:configure`.
4. Configure EAS-managed signing (iOS cert/profile, Android keystore — never in repo).

## Scope by surface

### MOBILE (`apps/mobile`)

- `eas.json` (new), `app.json` (`extra.eas.projectId`, `runtimeVersion`, `expo-updates` plugin), `package.json` (`expo-updates`).

## Acceptance

- `eas build -p ios|android --profile production` produces a signed build whose API points at `https://whocards.cc`.
- `eas update --channel production` publishes an OTA; fingerprint changes when native deps/config change.
- Build numbers auto-increment without manual edits.

## Notes / out of scope

- Accounts (#0012) are a prerequisite. CI wiring is #0016.
- The `EXPO_PUBLIC_API_URL` env here is the primary prod-URL mechanism; #0013 adds a code-level safety fallback.

## References

- ADR-0005, docs/RELEASE.md (Phase 0), `apps/mobile/.env.example`, `src/lib/trpc.ts`
