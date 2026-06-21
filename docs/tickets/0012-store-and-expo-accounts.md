# Store & Expo accounts + app records (Apple, Google Play, Expo)

**Tags:** mobile, release, logistics
**Surfaces:** mobile (`apps/mobile`)
**Status:** open (not started). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

No store presence exists. All three accounts must be created before anything can build or
submit. Apple org enrollment (D-U-N-S) has real lead time, so start early.

## Goal

Apple Developer Program, Google Play Console, and an Expo account/org all exist under durable
ownership, with an app record on each store ready to receive beta builds.

## Approach

1. **Apple Developer Program** ($99/yr). Prefer an organization (needs a D-U-N-S number — start
   now for lead time); otherwise a dedicated, non-throwaway account. Create the App Store Connect
   app record (bundle id `cc.whocards.mobile`).
2. **Google Play Console** ($25 one-time). Create the app; set up the Internal Testing track.
3. **Expo** account/org (free) — org-scoped for team continuity; used by #0011 `eas init`.
4. **Submit credentials**: App Store Connect API key (iOS) + Play service-account JSON (Android),
   stored as EAS/CI secrets (for #0016), never in the repo.

## Acceptance

- `eas submit -p ios` reaches TestFlight and `-p android` reaches Play Internal Testing.
- Ownership is durable/transferable (not a personal throwaway).

## Notes / out of scope

- Store listing copy/assets + compliance forms are #0017.
- Bundle ids are already correct in `app.json` (`cc.whocards.mobile`).

## References

- ADR-0005, docs/RELEASE.md (Phase 0 — Accounts)
