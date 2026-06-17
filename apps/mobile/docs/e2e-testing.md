# Mobile E2E testing — options & recommendation

**Yes, there is a way to E2E-test the Expo app.** The Expo-recommended approach (as of
Expo SDK / EAS 2026) is **Maestro**, a black-box UI test runner driven by simple YAML
flows. A ready starter flow lives in [`../.maestro/library.yml`](../.maestro/library.yml).

## The options

| Tool                        | Approach                                             | Setup                                      | Flakiness                                    | Fit here                                                                                                       |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Maestro** (recommended)   | Black-box via the OS accessibility layer; YAML flows | Near-zero; install a CLI, write YAML       | Very low (<1%); built-in auto-wait           | Expo's recommended tool; flows survive rebuilds, fast iteration, EAS Workflows has a first-class `maestro` job |
| **Detox**                   | Gray-box; hooks into the JS thread/native build      | Heavy; native config, Jest, async patterns | Higher; needs full rebuild when tests change | Powerful for deep RN integration, but more maintenance than this app needs                                     |
| **Appium**                  | Black-box, WebDriver                                 | Heavy server/driver setup                  | Medium                                       | Cross-platform/legacy; overkill here                                                                           |
| **Playwright (web export)** | Browser, against `expo export --platform web`        | Reuses our existing Playwright             | n/a (RN-web, not native)                     | Cheap complementary smoke; **not** a substitute for native fidelity                                            |

**Recommendation: Maestro** — it's what Expo recommends, the lowest-setup/lowest-flake
option, and its flows are platform-agnostic (one YAML runs on both iOS and Android). The
app's screens use plain, stable text (`Your library`, deck titles, `Next`/`Prev`), which is
exactly what Maestro asserts on.

## Run locally

```sh
# 1. Install the Maestro CLI (one-time)
curl -fsSL "https://get.maestro.mobile.dev" | bash

# 2. Build + install the app on a simulator/emulator (dev client or a release build)
pnpm -F mobile exec expo run:ios        # or run:android

# 3. Run the flow
cd apps/mobile && maestro test .maestro/library.yml
```

`appId` in the flow must match `app.json` → `ios.bundleIdentifier` / `android.package`
(currently `cc.whocards.mobile`).

## Run in CI (EAS Workflows)

EAS Workflows has a pre-packaged `maestro` job. Add an `e2e-test` build profile to
`eas.json` and a workflow that builds then runs the flows:

```jsonc
// eas.json
{
  "build": {
    "e2e-test": {
      "withoutCredentials": true,
      "ios": {"simulator": true},
      "android": {"buildType": "apk"},
    },
  },
}
```

```yaml
# .eas/workflows/e2e-test.yml
name: e2e-test
on: {pull_request: {branches: ['*']}}
jobs:
  build:
    type: build
    params: {platform: android, profile: e2e-test}
  maestro_test:
    needs: [build]
    type: maestro
    params:
      build_id: ${{ needs.build.outputs.build_id }}
      flow_path: ['.maestro/library.yml']
```

Run with `npx eas-cli@latest workflow:run .eas/workflows/e2e-test.yml` (requires an EAS
project — not yet configured for this repo).

## Status

The starter flow is authored against the app's real rendered text but has **not yet been
run on a simulator/emulator** in this environment (no device available here) — that's the
same outstanding mobile-runtime verification noted in the root `HANDOFF.md`. Once a
simulator run is done, wire the EAS workflow above (or a local `maestro test` step) into CI.

## Sources

- [Run E2E tests on EAS Workflows with Maestro — Expo Docs](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
- [Detox vs. Maestro: Reducing Flakiness in React Native — maestro.dev](https://maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native)
- [Detox vs Maestro vs Appium: React Native E2E 2026 — PkgPulse](https://www.pkgpulse.com/blog/detox-vs-maestro-vs-appium-react-native-e2e-testing-2026)
- [How to Set Up E2E Testing for React Native with Maestro — oneuptime](https://oneuptime.com/blog/post/2026-01-15-react-native-maestro-testing/view)
