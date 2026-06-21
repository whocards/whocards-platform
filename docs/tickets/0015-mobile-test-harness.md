# Mobile test harness: jest + RN Testing Library + expand the Maestro suite

**Tags:** mobile, testing, release
**Surfaces:** mobile (`apps/mobile`)
**Status:** open (not started). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

The release gate (RELEASE.md) is the "heavy" option: screen-level tests + a broader Maestro
suite + a device matrix. Today mobile has **no jest** (only `decks`/`api` use vitest) and a
**single** Maestro flow (RTL alignment).

## Goal

`apps/mobile` has unit/component tests and a happy-path Maestro suite that gate every build and OTA.

## Approach

1. Add **jest-expo** + **@testing-library/react-native**; `test` script wired into `turbo`/`pnpm check`.
2. Screen/component tests for the high-value logic: language persistence (`language-store`),
   `getDirection`/RTL alignment props, the splash→landing handoff state machine
   (measure/lift/entrance), and the offline answer-queue behaviour.
3. Expand `.maestro/` from the RTL flow to: launch→play→swipe→language→share, deep-link/back,
   and offline-record→reconnect-drain.
4. Document the device matrix (2 iOS + 2 Android OS versions) for the manual smoke.

## Acceptance

- `pnpm --filter mobile test` runs jest green; `pnpm check` includes it.
- The Maestro suite (≥3 flows) passes on a simulator.
- Gate documented for both store builds and OTA pushes.

## Notes / out of scope

- React Compiler is on — ensure the jest transform/babel config matches the app's.

## References

- ADR-0005, docs/RELEASE.md (Quality gate), `apps/mobile/.maestro/`
