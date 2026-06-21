# Mobile CI: PR quality gate + tag-triggered EAS build/submit/update

**Tags:** mobile, ci, release
**Surfaces:** mobile (`apps/mobile`), repo CI
**Status:** open (not started). Raised 2026-06-21. Per [ADR-0005](../adr/0005-mobile-release-pipeline.md) · runbook [docs/RELEASE.md](../RELEASE.md).

## Context

ADR-0005 chose full automation from day one. There's no CI today (`.github/workflows/` is empty).

## Goal

PRs are gated; tagging `vX.Y.Z` builds, submits to the beta tracks, and publishes an OTA — all in CI.

## Approach

1. **PR/main workflow**: `pnpm check` + the Maestro suite (sim) on PRs to `main`.
2. **Release workflow** (on `v*` tags): re-run the gate → `eas build -p ios|android --profile production`
   → `eas submit` (TestFlight / Play Internal) → `eas update --channel production` for JS.
3. Secrets: `EXPO_TOKEN` + store-submit creds (App Store Connect API key, Play service-account JSON).
4. Decide the OTA-only path (a JS hotfix shouldn't always trigger a full native build — e.g. a
   separate `update`-only workflow or a tag/label convention).

## Scope by surface

### REPO (`.github/workflows/`)

- `mobile-gate.yml` (PR), `mobile-release.yml` (tag).

## Acceptance

- A PR runs the gate and blocks on failure.
- Tagging `v1.0.0` produces beta builds + an OTA without manual EAS commands.

## Notes / out of scope

- Depends on #0011 (eas.json), #0012 (accounts/creds), #0015 (the gate). Do the **first** release by hand once to validate the flow before trusting the tag path (RELEASE.md).

## References

- ADR-0005, docs/RELEASE.md (Phase 0 — CI)
