# Installing WhoCards on a physical device for pre-release testing

Use this guide to get a build onto a real iPhone or Pixel before promoting to the public
store — particularly when the change is native (splash, universal/app links, haptics, any
new native module) and cannot be tested in Expo Go.

**The commands below are real** — running `pnpm mobile:rebuild:ios` locally with
`EXPO_TOKEN` set will immediately trigger an EAS production build and TestFlight
submit. The `EAS_RELEASE_ENABLED` guard lives only in the CI workflow; it does not
protect local runs. Execute these commands only when explicitly ready to build.

---

## Prerequisites

- [EAS CLI](https://docs.expo.dev/eas/eas-cli/) installed: `pnpm add -g eas-cli` or use
  `pnpx eas-cli@latest` to run without installing globally.
- `EXPO_TOKEN` — your personal Expo token (CI uses a secret; locally you can export it or
  run `eas login`). **Do not commit this to the repo.**
- For Android: `adb` in your `PATH` (ships with [Android Studio Platform Tools](https://developer.android.com/tools/releases/platform-tools)).

---

## iOS — physical iPhone

### Option A: TestFlight internal testing (preferred)

The app is already live. A new production build automatically lands in App Store Connect
where you can push it to internal testers before promoting to the public.

1. Cut a release (`pnpm release`) or trigger a native rebuild:
   ```sh
   RELEASE_SKIP_E2E=1 pnpm mobile:rebuild:ios   # when e2e isn't needed
   ```
   CI builds the binary and submits it to **TestFlight** (internal track) once
   `EAS_RELEASE_ENABLED=true`.
2. In **App Store Connect → TestFlight → Internal Testing**, add the build to your internal
   group and invite testers by email.
3. Testers install via the **TestFlight** app — no UDID registration required.

> Bundle ID: `cc.whocards.mobile` · Team ID: `6RTC67K8CW`

### Option B: EAS internal distribution (ad-hoc, without App Store)

Use this when you need a one-off build outside the release cycle — e.g. to test a branch.

1. Register the device UDID with EAS (one-time per device):

   ```sh
   pnpx eas-cli@latest device:create
   ```

   Follow the prompt to scan a QR code from the device or paste the UDID manually (found
   in **Finder → device sidebar → serial number area**).

2. Build with the `development` or `preview` profile (both use `distribution: "internal"`):

   ```sh
   pnpx eas-cli@latest build -p ios --profile development
   # or for a production-like build without App Store:
   pnpx eas-cli@latest build -p ios --profile preview
   ```

3. EAS emails a QR code / install link. Open it on the device in Safari, trust the
   enterprise profile when prompted, then install.

> Native config changes (`app.json` plugins, entitlements) require a fresh build — OTA
> (`eas update`) cannot deliver them.

---

## Android — physical Pixel

### Option A: EAS internal distribution (recommended)

1. Build with the `development` or `preview` profile:

   ```sh
   pnpx eas-cli@latest build -p android --profile development
   # or:
   pnpx eas-cli@latest build -p android --profile preview
   ```

2. EAS produces an APK (development) or AAB (production). For the `development` profile EAS
   wraps it as an installable APK. Follow the install link/QR from the build output.

3. On the device: **Settings → Apps → Special app access → Install unknown apps** and allow
   the browser or Files app. Then open the install link from the EAS email or dashboard.

> Package: `com.whocards.mobile`

### Option B: `adb install` (local build or downloaded APK)

If you have an APK locally (e.g. from `expo run:android --variant release`):

1. Enable **USB debugging** on the Pixel:
   **Settings → About phone → tap "Build number" 7 times** to unlock developer options, then
   **Settings → System → Developer options → USB debugging ON**.

2. Connect via USB, confirm the RSA fingerprint on-device, then:

   ```sh
   adb devices              # confirm the device is listed
   adb install path/to/app.apk
   ```

3. Launch **WhoCards** from the home screen or:
   ```sh
   adb shell am start -n com.whocards.mobile/.MainActivity
   ```

---

## Verifying App Links on Android (for #124 universal links)

After installing a build that includes the `/.well-known/assetlinks.json` configuration,
confirm Android has verified the App Links association:

```sh
# List the App Links verification status for WhoCards
adb shell pm get-app-links com.whocards.mobile
```

Expected output includes `verified` for each domain (`whocards.cc`). If verification is
pending or failed:

```sh
# Force re-verification (requires internet access on the device)
adb shell pm verify-app-links --re-verify com.whocards.mobile
```

Wait ~30 seconds, then re-run `get-app-links` to confirm `verified`. If it stays
`verification_failed`, check that `https://whocards.cc/.well-known/assetlinks.json` is
reachable and contains the correct SHA-256 certificate fingerprint.

To find the certificate fingerprint for the current build:

```sh
# For a locally-built debug APK:
keytool -printcert -jarfile path/to/app.apk

# For a production EAS build, check EAS credentials:
pnpx eas-cli@latest credentials -p android
```

---

## See also

- [RELEASING.md](../../RELEASING.md) — cutting releases, OTA updates, and the full CI pipeline.
- [docs/RELEASE.md](../RELEASE.md) — runbook and phase checklist, including the device smoke matrix.
- [`eas.json`](../../apps/mobile/eas.json) — build profiles (`development` / `preview` / `production`).
