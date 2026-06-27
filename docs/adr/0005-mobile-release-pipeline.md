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
- **Amendment (2026-06-22) — iOS-first for v1.** The v1 launch was planned **iOS first** while the
  Google Play account was blocked (#27), with the Android build/submit steps temporarily gated behind
  a `MOBILE_ANDROID_ENABLED` repo variable so iOS could ship without them.
- **Amendment (2026-06-23) — Android re-enabled.** A fresh Play account + service-account JSON are
  set up and the release verified rendering on device, so the `MOBILE_ANDROID_ENABLED` gate is
  **removed**: iOS and Android build/submit together under the single `EAS_RELEASE_ENABLED` switch.
  Remaining Android prerequisite (outside the pipeline): create the Play app record and hand-upload
  the first AAB, which Google requires before `eas submit -p android` succeeds.
- **Amendment (2026-06-27) — split public release (iOS first).** The CI pipeline still builds and
  submits **both** platforms to their test tracks together; this amendment governs only the _public_
  release. We drop the earlier "hold approved iOS until Android clears its gate" rule: iOS is approved
  and goes public now, while Android completes Google's mandatory 12-tester / 14-day Closed Test and
  production-access review (a minimum of ~14 days, and we do not yet have 12 testers). **Trade-off:**
  two launch moments and two announcements instead of one, accepted because holding a finished,
  approved iOS build for weeks costs real retention for no benefit. The website encodes this with
  per-platform flags (`PUBLIC_APP_IOS_LAUNCHED`, `PUBLIC_APP_ANDROID_LAUNCHED`): `/app` shows a real
  iOS download and routes Android visitors to `/android-testers` until the Android flag flips. See
  `docs/growth/04-app-launch-plan.md` for the launch/campaign side.
