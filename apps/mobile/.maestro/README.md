# Mobile e2e + store screenshots (Maestro)

End-to-end flows for the Expo app, run with [Maestro](https://maestro.mobile.dev)
against a build installed on a booted simulator/emulator.

## Flows

The flows are shared, but the installed app id differs by platform. Always use the explicit
platform command so Maestro targets the binary that is actually installed:

```bash
pnpm -F mobile e2e:ios      # cc.whocards.mobile
pnpm -F mobile e2e:android  # com.whocards.mobile
```

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
- `language-modal-inset.yaml` — opens the language sheet and screenshots it so the
  header can be confirmed clear of the status bar / display cutout on a device **with a
  cutout** (the Pixel-notch fix, #102). The inset math is also guarded deterministically
  by `src/__tests__/language-modal.test.tsx`.
- `share-question-url.yaml` (**android only**) — cold deep-links to `q=1`, taps Share,
  and asserts the question's web link (`whocards.cc/play…?q=1`) shows in Android's
  share-sheet preview (the share-link fix, #101). The URL builder itself is unit-tested
  in `src/__tests__/share-url.test.ts`; iOS doesn't expose the share-sheet text to match.

All flows are tagged `ios` + `android` (and run on either platform) except
`share-question-url.yaml`, which is `android` only — iOS's share sheet doesn't surface
the URL as matchable text, so the iOS share tap is covered by `play-language-share.yaml`.

### Why the splash fix (#100) has no flow

The Android splash-icon padding fix (#100) can't be asserted with a flow: the native
splash window is dismissed before Maestro's first command runs, so there's nothing on
screen to screenshot or match. It's guarded at the config/asset level instead by
`src/__tests__/splash-config.test.ts` (the `android` image override is set and the asset
stays near-square), with the final visual confirmation done by a manual cold launch on
an Android 12+ device.

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

Output: `store-assets/<device>/NN-*.png` (gitignored — regenerate on demand).

**Default (no `DEVICES`)** captures the App Store-required **iOS 6.5" set** — the script
resolves an available 6.5"-class simulator by name (iPhone 14 Plus → 1284×2778) and writes
it to `store-assets/iphone-6.5/`, verified against an accepted size:

```bash
pnpm -F mobile screenshots
```

Set `DEVICES` explicitly to drive a full matrix (the folder name still drives the size check):

```bash
DEVICES="<udid>:iphone-6.5 <udid>:iphone-17-pro emulator-5554:pixel-3a" \
  pnpm -F mobile screenshots
```

### Required App Store sizes — the 6.5" set (#111)

App Store Connect **requires** a 6.5" Display screenshot set to submit the iOS app.
Name the output folder for the slot (`iphone-6.5`) and the capture script verifies each
PNG is an Apple-accepted size for that slot — a wrong-sized capture fails here instead of
being rejected at upload.

| Slot folder             | Accepted portrait px           | Simulator that renders it                       |
| ----------------------- | ------------------------------ | ----------------------------------------------- |
| `iphone-6.5`            | **1242×2688** or **1284×2778** | iPhone 11 Pro Max / XS Max · **iPhone 14 Plus** |
| `iphone-6.7`            | 1290×2796                      | iPhone 15 Plus / 15 Pro Max / 14 Pro Max        |
| `iphone-6.9`            | 1320×2868                      | iPhone 16 Pro Max                               |
| `ipad-13` / `ipad-12.9` | 2048×2732                      | iPad Pro 13" / 12.9"                            |

The mandatory 6.5" set is the **default** (`pnpm -F mobile screenshots`, see above) — it
resolves a 6.5"-class simulator (iPhone 14 Plus → 1284×2778) automatically. Install the
Release `.app` on that sim first (see "Building + installing" below). To pin a specific
device explicitly:

```bash
DEVICES="<iphone-14-plus-udid>:iphone-6.5" pnpm -F mobile screenshots
# → store-assets/iphone-6.5/NN-*.png, each verified ✓ at an accepted 6.5" size
```

Only `iphone-6.5` / `iphone-6.7` / `iphone-6.9` / `ipad-13` / `ipad-12.9` folder names
are dimension-checked; any other name (e.g. `pixel-3a`) is captured without a size check.

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

For everyday development, `pnpm -F mobile android` starts Metro and opens an already-installed
development build. If Expo reports that no development build is installed, run
`pnpm -F mobile android:build` once for that emulator/device, then use `pnpm -F mobile android` on
subsequent starts.

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

> Status: the Android release **renders correctly** end-to-end — landing entrance, Play, the
> swipe/chrome/language/share flows all work. Verified on a freshly-booted Pixel 9 emulator
> (API 35, `-gpu host`): 6/6 cold launches paint the full landing (logo, tagline, card count,
> Play). The store screenshots in `store-assets/pixel-9` + `pixel-9-pro-xl` were captured this
> way.
>
> The "blank landing" (logo on a dark screen, no tagline/Play) is **not a code bug** — the
> landing mounts and is fully interactive even when blank (tapping where Play sits navigates
> to a card; the card then paints perfectly). It's a **cold-start first-paint stall under a
> degraded/overloaded emulator**: the landing's reveal is gated on a post-mount JS timer +
> Reanimated, and when the JS thread is starved at startup (software `-gpu swiftshader`, or a
> long-lived emulator after dozens of rapid `pm clear`+relaunch cycles — memory pressure/GC)
> that timer fires many seconds late or not within the capture window, so the splash→landing
> handoff is caught before content reveals. A real device / fresh emulator clears this in
> well under a second. Repro notes: under swiftshader it was blank at t=4s but fully rendered
> by t=10s on the identical APK; on a degraded long-running `-gpu host` session it went ~0/8,
> while a fresh boot of the same APK was 6/6. So for Maestro/screenshots: **boot a FRESH
> emulator with `-gpu host`**, don't hammer it with dozens of relaunches in one session, and
> give the first `assertVisible` a generous timeout. Also run
> `adb shell settings put global hide_error_dialogs 1` first, so a system ANR (e.g. Digital
> Wellbeing) can't pop over the app and fail an `assertVisible`.

## Running

```bash
pnpm -F mobile e2e:ios
pnpm -F mobile e2e:android
maestro --device <id> test .maestro/deep-link-back.yaml -e APP_ID=com.whocards.mobile
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
