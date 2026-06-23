# Mobile release runbook & checklist

How `apps/mobile` (the WhoCards Expo app) gets built, tested, and shipped. Decisions and
their trade-offs live in [ADR-0005](./adr/0005-mobile-release-pipeline.md); this is the
operational checklist.

**Pipeline at a glance:** EAS Build + Submit · **beta-first** (TestFlight + Play Internal →
promote to public) · OTA via EAS Update on a `fingerprint` runtime version · build numbers
auto-incremented by EAS · fully automated in CI on `v*` tags.

**v1.0 scope:** landing → single WhoCards Deck → Global Game (swipe nav, 14 languages + RTL,
language persistence, share, offline Answer recording, branded splash/handoff). Out: Library
browse, Custom Decks, Personal Game, accounts/purchases, Facilitation (all future per CONTEXT.md).

---

## Phase 0 — One-time foundation

> **Android is back in the release** ([#27](https://github.com/whocards/whocards-platform/issues/27)) — a fresh Google
> Play account + service-account JSON are set up, and the release verified rendering on device. iOS and Android now
> build/submit together under the single `EAS_RELEASE_ENABLED` switch (the old `MOBILE_ANDROID_ENABLED` gate is removed).
> Remaining Android prerequisite: create the Play app record and hand-upload the first AAB (Google requires this before
> `eas submit -p android` works).

- [ ] **Accounts** — Apple done; Google Play deferred (#27)
  - [x] Apple Developer Program ($99/yr) — enrolled; App Store Connect app record created (`ascAppId 6782853824`, Team ID `6RTC67K8CW`)
  - [ ] Google Play Console ($25 one-time) — **deferred to #27** (prior account closed for inactivity; re-registration under a fresh dedicated Google account pending)
  - [x] Expo account / org (free) — projectId `70c97b4d…` wired into `app.json`; `EXPO_TOKEN` set as an Actions secret
- [x] **EAS init** — `projectId` committed to `app.json` (`extra.eas.projectId`)
- [x] **Credentials** — EAS-managed signing: iOS distribution cert + provisioning done (Android keystore deferred → #27). Local `credentials.json` is gitignored (it holds a plaintext cert password)
- [x] **Submit creds** — App Store Connect API key stored on EAS; push it to CI with `apps/mobile/scripts/set-mobile-ci-secrets.sh`. Android Play service-account key: upload to EAS (`eas credentials` → Android → Google Service Account) so `eas submit` pulls it — no `serviceAccountKeyPath`, no CI secret
- [x] **`eas.json`** — `cli.appVersionSource: "remote"`; profiles `development` / `preview` / `production`; `autoIncrement` on `production`; per-profile `env` (`EXPO_PUBLIC_API_URL`); channels `preview` / `production`
- [x] **OTA** — `expo-updates` added; `runtimeVersion: { "policy": "fingerprint" }` set in `app.json`
- [x] **CI** (GitHub Actions, `.github/workflows/`)
  - [x] PR/main workflow: the quality gate (`mobile-gate.yml`)
  - [x] Tag (`v*`) workflow: gate → `eas build` → `eas submit` (beta) → `eas update` (`mobile-release.yml`) — **inert until `EAS_RELEASE_ENABLED=true`** (iOS + Android together)
  - [x] Secrets: `EXPO_TOKEN` set; iOS ASC API key via the script above; Android Play key lives on EAS (not a CI secret)
- [ ] **`docs/mobile/README` / this runbook** linked from the repo README

## Phase 1 — Blockers before the first build

These make the binary correct; the app is broken or unshippable without them.

- [x] **Prod API URL** — `production` (and `preview`) profile sets `EXPO_PUBLIC_API_URL=https://whocards.cc` in `eas.json` (app calls `/api/trpc`); without it the build falls back to `localhost:4321`. Prod API verified live 2026-06-21 (`/api/trpc/decks.manifest` & `pool.languages` → `200`, see #20).
- [x] **App display name** — `app.json` `name` is **WhoCards**; `slug` is `whocards-app` (matches the EAS project); bundle IDs `cc.whocards.mobile` correct. (`scheme` stays `mobile` — that's the deep-link scheme, unrelated.)
- [x] **App icon** — WhoCards dark `?` mark (`icon.png` + Android adaptive icons); intentionally dark-only
- [x] **Version fields** — `version: "1.0.0"`; build numbers via EAS remote auto-increment (no manual `buildNumber`/`versionCode`)
- [x] **Error boundary** — root error boundary with recovery in `src/components/error-boundary.tsx`, mounted in `src/app/_layout.tsx`
- [ ] **Quality gate green** (see below)

## Phase 2 — Cut the first beta

- [ ] `eas build -p ios --profile production` (Android `-p android` deferred → #27)
- [ ] `eas submit -p ios` → TestFlight (Android `-p android` → Play Internal Testing deferred → #27; first Android AAB must be hand-uploaded once unblocked)
- [ ] **Device matrix smoke**: 2 iOS + 2 Android OS versions — launch, splash→landing handoff, play/swipe, language switch + RTL (Hebrew right-aligned), language persists across relaunch, share, **offline → reconnect drains the Answer queue**, deep-link/back
- [ ] File and fix anything found as `v1.0.x` (OTA if JS-only, rebuild if native)

## Phase 3 — Before promoting to public

- [ ] **Observability live** — production EAS builds include the PostHog EU project key; confirm events + JS errors arrive from the beta build
- [x] **Privacy Policy** — `whocards.cc/legal/pp` discloses the app's data: Device id, the Answer record, PostHog analytics
- [ ] **App Privacy (Apple) + Data Safety (Play)** forms filled to match (device id, usage/analytics; no tracking SDK unless added)
- [ ] **Store assets** — name, subtitle, description, keywords, category, support URL, and per-device-size screenshots (raw captures via `pnpm -F mobile screenshots`, #34; then frame/compose)
- [ ] **Permissions** — confirm only what's used (network, haptics); no stray permission pulled in by a dep
- [ ] Promote the **same** validated build to the public App Store + Google Play

## Ongoing — the per-release loop

1. Land changes via PRs (CI gate must pass).
2. Decide the change type:
   - **JS/asset only** → `eas update --channel production` (OTA; no store round-trip). Same gate applies.
   - **Native change** (fingerprint shifts) or a marketing version bump → bump `version` if user-facing, tag `vX.Y.Z` → CI builds, submits to beta, promote after the device-matrix smoke.
3. Keep the device-matrix smoke for every native build; OTA pushes still pass the JS gate.

## Quality gate (build **and** OTA)

- [ ] `pnpm check` green (tsc + oxlint + oxfmt + `decks`/`api` unit tests + **mobile jest suite**)
- [ ] **Mobile unit/component tests** — `pnpm --filter mobile test` (jest + RN Testing Library; covers language-store, answer-queue, device-id, getBaseUrl, ErrorBoundary)
- [ ] **Maestro suite** — `pnpm --filter mobile e2e` (flows: `play-language-share`, `deep-link-back`, `language-persist`, `rtl-alignment`; see `.maestro/README.md`). Offline-record→drain has no observable UI signal and is covered by the `answer-queue`/`answer-transport` jest tests instead.
- [ ] Manual smoke on the **device matrix** (native builds — see below)

## Device matrix

Manual smoke checklist for every native build (not required for OTA-only pushes).
Scenarios: launch→play→swipe, language switch + RTL (Hebrew), language persists across relaunch,
share, offline→reconnect Answer queue drain, deep-link/back.

| Platform | OS version | Notes                                  |
| -------- | ---------- | -------------------------------------- |
| iOS      | iOS 17     | Latest stable; Simulator + real device |
| iOS      | iOS 16     | One major back; Simulator is fine      |
| Android  | Android 14 | API 34; emulator or real device        |
| Android  | Android 12 | API 31; covers ~50% of active installs |

## Hotfix & rollback

- **JS hotfix:** `eas update --channel production` (reaches compatible binaries only, per the fingerprint policy).
- **Rollback an OTA:** `eas update --channel production` re-publishing the last-good commit, or `eas update:rollback`.
- **Bad binary:** halt the store rollout (Play staged rollout / App Store phased release), ship a corrected build; OTA can't replace native code.
