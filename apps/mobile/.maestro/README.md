# Mobile e2e + store screenshots (Maestro)

End-to-end flows for the Expo app, run with [Maestro](https://maestro.mobile.dev)
against a build installed on a booted simulator/emulator.

## Flows (the quality gate — `pnpm -F mobile e2e`)

- `play-language-share.yaml` — launch → play → swipe forward/back → switch language →
  share. Exercises the landing CTA, the swipe gesture engine, the auto-hiding chrome,
  the language sheet, and the share action in one pass.
- `deep-link-back.yaml` — cold deep-link (`mobile://play/library?q=1`) straight to a
  question, then exit back to the landing. `?q=` pins the engine to a question in
  natural order (no shuffle), so the deep link is reproducible.
- `language-persist.yaml` — a chosen language survives an app relaunch (the
  `language-store` persistence, ticket 0009). Uses `?q=1` so the same card renders
  before/after, making the switch observable.
- `rtl-alignment.yaml` — opens a card, screenshots the default (English, LTR) and the
  Hebrew (RTL) card to verify right-alignment. Screenshots land in `.maestro/artifacts/`.

All four are tagged `ios` + `android` and run on either platform.

### Why no offline-record→drain flow

The answer queue's offline-record-then-drain behaviour has **no observable UI signal**
(the drain is a silent background `tRPC` send), and `setAirplaneMode` is a no-op on iOS
simulators. A Maestro flow there would assert nothing meaningful. That path is covered by
the jest unit tests instead — `src/__tests__/answer-queue.test.ts` (enqueue/drain/persist/
ordering/trim/flush) and `answer-transport.test.ts`.

## Store screenshots (#34) — `pnpm -F mobile screenshots`

`.maestro/screenshots/store-screens.yaml` captures deterministic listing frames
(landing, English card, language picker, Hebrew/RTL card) for the App Store / Play Store.
It's tagged `screenshots` so the e2e gate skips it. `?q=1` + waiting for the chrome to
auto-hide makes the captures reproducible and clean.

Output: `store-assets/<device>/NN-*.png` (gitignored — regenerate on demand). Drive a
device matrix with the capture script:

```bash
DEVICES="<udid>:iphone-17-pro-max <udid>:iphone-17-pro emulator-5554:pixel-3a" \
  pnpm -F mobile screenshots
```

The framing/compositing step (device frames + marketing copy, e.g. fastlane `frameit` or a
Sharp/Satori compositor reusing `apps/website/src/server/card-image.ts`) is a follow-up —
this produces the raw, correctly-sized device captures it consumes.

## Prerequisites (one-time)

- **Maestro CLI** — `curl -fsSL "https://get.maestro.mobile.dev" | bash`.
- **A JDK on `JAVA_HOME`** — Maestro and the Android build both need one. If you see
  `JAVA_HOME is set to an invalid directory`, point it at an installed JDK, e.g.
  `export JAVA_HOME="$(/usr/libexec/java_home)"`.
- **CocoaPods** (iOS) — `brew install cocoapods`.

## Building + installing the app

The flows need a self-contained **Release** build (embeds the JS bundle, so Metro isn't
needed during the run). Build once, then install the same `.app`/APK on every device:

```bash
# iOS — build, then install on additional sims from the build product:
pnpm -F mobile exec expo run:ios --configuration Release --device "iPhone 17 Pro Max"
xcrun simctl install <other-sim-udid> \
  ~/Library/Developer/Xcode/DerivedData/WhoCards-*/Build/Products/Release-iphonesimulator/WhoCards.app

# Android — release variant is self-signed with the debug keystore (see android/app/build.gradle):
pnpm -F mobile exec expo run:android --variant release
```

### Android toolchain notes

Getting a local Android **release** build to succeed needs three things:

1. **Gradle 8.14 + JDK 17.** The generated `android/` wrapper pins Gradle 9.3.1, which
   removed `JvmVendorSpec.IBM_SEMERU` — an API the RN 0.85 gradle plugin still references.
   Set the wrapper to `gradle-8.14.3-bin.zip` and use JDK 17 (`brew install openjdk@17`;
   `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`). 8.x has the field; it also won't run
   on JDK 23+, so JDK 26 alone can't build.
2. **`.env` must be loaded.** The JS bundle (`createBundleReleaseJsAndAssets`) imports
   `src/env.ts`, whose validation throws when the `EXPO_PUBLIC_*` vars are absent — and a
   bare `./gradlew` doesn't load `.env`, so Metro dies with a confusing
   `Cannot read properties of undefined (reading 'transformFile')`. Run the build through
   `pnpm with-env` so `.env` is present:
   `pnpm with-env android/gradlew -p android :app:assembleRelease -x lint -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease`
3. **More Metaspace, skip release lint.** Bump `org.gradle.jvmargs` Metaspace (KSP OOMs at
   the default 512m) and skip the `lintVital*` tasks (lint analysis crashes under this JDK).

> Status: on the Pixel emulator the release build installs and launches without the PostHog
> crash, but the landing content does not yet render (a separate Android-release rendering
> issue — empty view tree). The flows are `android`-tagged and pass on iOS; the Android run
> is blocked on that render bug, tracked separately.

## Running

```bash
pnpm -F mobile e2e                         # the gate (all flows, all booted device(s))
maestro --device <id> test .maestro/deep-link-back.yaml   # a single flow on a device
```

Run against **one booted simulator at a time** unless you pass `--device <udid>` — with
several sims booted, Maestro's iOS driver otherwise attaches to whichever booted first.

## Notes

- Selectors use accessibility labels (`change language`, `exit deck`, `next question`,
  `share question`) because the bar buttons collapse their inner text — match the label.
- The player chrome auto-hides after 3s; flows tap the card centre to re-reveal it before
  tapping a control, and wait for it to hide before shooting clean card screenshots.
- iOS shows an "Open in WhoCards?" confirm when `openLink` fires while the app is
  foregrounded; flows `stopApp` first so the deep link cold-launches without it.
