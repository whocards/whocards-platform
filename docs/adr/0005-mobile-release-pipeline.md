# Mobile ships via EAS, beta-first, with OTA on a fingerprint runtime version

**Status:** accepted

The `apps/mobile` Expo app releases through **EAS Build + EAS Submit**. Every release goes
**beta-first** — the same store binary is published to TestFlight (iOS) and Play Internal
Testing (Android), validated on real devices, then **promoted to the public stores** (no
separate "public build"). Three EAS profiles exist — `development` (dev client → LAN/localhost
API), `preview` (internal QA build → prod API), `production` (store build → beta track → public)
— with only two API targets: dev and prod (`https://whocards.cc`, which mounts the tRPC router
per ADR-0002). No staging tier until a staging deploy exists.

JS/asset fixes ship between binaries via **EAS Update (OTA)** on a **`fingerprint` runtime
version**: the runtime version is a hash of the native deps/config, so an OTA only reaches
binaries it's actually compatible with and auto-invalidates the moment native changes (a native
dep, the React-Compiler/babel pipeline, or native `app.json` config) — forcing a new store
build instead of a crash. Channels mirror the profiles (`preview`, `production`).

Build numbers are EAS-managed (`cli.appVersionSource: remote`, `autoIncrement` on `production`);
the human version (`1.0.0`) is hand-bumped per meaningful release. The whole pipeline is
**automated in CI from day one**: GitHub Actions runs the quality gate on PRs and, on a `v*`
tag, runs the gate → `eas build` → `eas submit` (beta track) → `eas update`.

## Considered Options

- **EAS Build/Submit + OTA, beta-first, automated (chosen).** Lowest-friction path for a managed
  Expo app (no committed `ios/`/`android/`), EAS owns signing, OTA gives a hotfix path, and
  beta-first de-risks each release. Cost: Expo/EAS as a dependency and CI secrets to manage.
- **Self-hosted builds (fastlane / GitHub Actions runners).** Maximum control, no Expo build
  dependency, but we own keystore/cert plumbing — far more setup for a first release with no
  offsetting benefit at this scale.
- **`appVersion` runtime-version policy instead of `fingerprint`.** Simpler to reason about, but
  native compatibility becomes manual discipline; one forgotten bump can OTA JS that needs newer
  native onto older binaries and crash them. Rejected for safety.
- **Store-only (no OTA) for v1.** Simplest first release, but every one-line fix needs a full
  rebuild + store round-trip. Rejected — a hotfix path is the point of "set up for more releases."
- **Straight-to-public (no beta tier).** Front-loads all store/compliance before any build and
  removes the on-device safety net. Rejected in favour of beta-first.

## Notes

- Crash/analytics observability is **PostHog-only** (finish ticket 0004's `posthog-react-native`
  sink + a root error boundary) rather than adding Sentry — it reuses the `@whocards/logger`
  injected-sink pattern; the accepted trade-off is weaker native-crash detail (Sentry can be
  added later without changing this pipeline).
- `runtimeVersion` decoupling means the user-facing version and OTA compatibility move
  independently — don't tie store-listing version bumps to OTA reach.
- The release **runbook and the build-up checklist** live in `docs/RELEASE.md`; this ADR records
  only the decisions and their trade-offs.
- **Amendment (2026-06-22) — iOS-first for v1.** The "TestFlight **and** Play Internal" beta step
  above is the steady-state intent, but the v1 launch ships **iOS first**: the Google Play account
  is blocked (deferred to #27). The pipeline itself is unchanged — the Android build/submit steps in
  `mobile-release.yml` are simply gated behind the `MOBILE_ANDROID_ENABLED` repo variable (off), so
  iOS releases run end-to-end without them. Flip the variable on once #27 lands a working Play
  account + service-account secret; no pipeline rework is needed.
