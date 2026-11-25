# Mobile e2e flows and store screenshots

Device flows for the Expo app, written with tester.army's [`e2e`](https://e2e.tester.army/docs) runner and its `@e2e-dev/mobile` engine. They run on WhoCards' own devices on Avi's Mac, never in CI, and never on another project's simulator.

```bash
pnpm -F mobile devices                 # create WhoCards iPhone 17 Pro, WhoCards iPhone 14 Plus, WhoCards Duo
pnpm -F mobile e2e                     # every flow on WhoCards iPhone 17 Pro
pnpm -F mobile e2e --device duo        # every flow on the WhoCards Duo emulator (Android)
pnpm -F mobile e2e deep-link-back      # one flow, by file name
SHOTS_DIR=/tmp/shots pnpm -F mobile e2e   # also save each flow's last screen as <flow>.png
```

`scripts/e2e.mjs` creates, boots and (iOS) slims the device with simslim first (`apps/mobile/simslim.json`), then runs `e2e run --target ios|android` on it. The app must already be installed: `pnpm release:check` builds and installs a Release one (see below). Reports land in `apps/mobile/.e2e/`.

## Flows

Each `*.e2e.ts` is one flow. `support.ts` has the shared steps: a clean launch, cold deep links into the player (`mobile://play/library?q=N`, which pins the Pool's natural order so the question is known), and the Settings sheet.

- Selectors are accessibility labels (`exit deck`, `open settings`, `share question`, `Game: <title>`, `Theme: <label>`, `Language: <name>`), since those buttons collapse their inner text.
- The player's controls auto-hide after 3 s; flows tap the card to bring them back before tapping one.
- Deep links go to a closed app: a foregrounded app makes iOS ask "Open in WhoCards?".
- `share-question-url` is Android only: iOS's share sheet doesn't expose the link as text.
- The answer queue's offline drain has no UI signal and the Android splash padding is gone before a flow starts; jest covers both (`answer-queue.test.ts`, `splash-config.test.ts`).

## Store screenshots: `pnpm -F mobile screenshots`

`store-screens.e2e.ts` (tag `screenshots`, which `pnpm -F mobile e2e` leaves out) shoots the listing frames: landing, English card, language picker, Hebrew card. With no `DEVICES` it captures `WhoCards iPhone 14 Plus` to `store-assets/iphone-6.5/` (gitignored) and checks each PNG is a size App Store Connect accepts. A matrix: `DEVICES="plus:iphone-6.5 pro:iphone-17-pro duo:duo"`.

| Slot folder             | Accepted portrait px           | Simulator                   |
| ----------------------- | ------------------------------ | --------------------------- |
| `iphone-6.5`            | **1242×2688** or **1284×2778** | **WhoCards iPhone 14 Plus** |
| `iphone-6.7`            | 1290×2796                      | iPhone 15 Plus / 15 Pro Max |
| `iphone-6.9`            | 1320×2868                      | iPhone 16 Pro Max           |
| `ipad-13` / `ipad-12.9` | 2048×2732                      | iPad Pro 13" / 12.9"        |

## Before/after UI diff: `pnpm -F mobile ui-diff`

For dependency upgrades: capture the store frames on the pre-upgrade ref, then on the upgrade branch, and compare frame for frame (`shasum`). The baseline must come from the pre-upgrade ref, or it proves nothing. The script doesn't build; install each ref's Release build first.

```bash
pnpm -F mobile ui-diff capture before   # on main, its build installed
pnpm -F mobile ui-diff capture after    # on the upgrade branch, its build installed
pnpm -F mobile ui-diff compare before after
```

## Building and installing

`pnpm release:check ios|android` builds a self-contained Release app (JS embedded, no Metro) and installs it on the WhoCards device. By hand:

```bash
pnpm -F mobile exec expo run:ios --configuration Release --device "WhoCards iPhone 17 Pro"
pnpm -F mobile exec expo run:android --variant release
```

Android release builds need JDK 17 (`brew install openjdk@17`) and `.env` loaded: run Gradle through `pnpm with-env`, as `scripts/release/pre-release-check.mjs` does. A blank landing on a cold emulator is a first-paint stall on an overloaded emulator, not an app bug: boot it fresh with `-gpu host` (which `scripts/devices.mjs` does).
