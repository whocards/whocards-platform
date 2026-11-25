# Testing

## Every push

`pnpm check`: oxfmt, oxlint (`--deny-warnings`) and turbo typecheck + test. Never eslint or prettier.

CI (`ci.yml`) requires **Quality gate**, **Website e2e** and the website deploy preview on `main`, and a branch must be up to date with `main` before it merges.

## Website e2e (Playwright)

`pnpm test:e2e` and `pnpm test:e2e:ssr`. Runs in CI on Ubuntu. On a macOS 13 Mac, locally:

1. Current Playwright has no Chromium for macOS 13. Pin `@playwright/test` to `1.61.1` in `apps/website/package.json`, `pnpm install`, run, then restore the pin and check `pnpm install --frozen-lockfile` is clean.
2. Warm `apps/website/.cache/og` with `pnpm build:web` first, or the web server times out re-rendering every OG image. Never clear that cache casually; a failing card-image test suspects a stale cache first.

Astro's dev toolbar intercepts clicks in the local SSR suite (Share tests), not in CI; trust CI there.

## Mobile

- Unit tests: jest, with the helpers in `apps/mobile/src/test-utils`.
- E2E: tester.army `e2e` flows in `apps/mobile/e2e/*.e2e.ts`, run with `pnpm --filter mobile e2e` (`--device duo` for Android). See [apps/mobile/e2e/README.md](../../apps/mobile/e2e/README.md) and [docs/mobile/device-testing.md](../mobile/device-testing.md). They run only on Avi's Mac, on the WhoCards devices below, and gate `pnpm release`.
- Devices: WhoCards' own, from `pnpm -F mobile devices` (`apps/mobile/scripts/devices.mjs`): `WhoCards iPhone 17 Pro`, `WhoCards iPhone 14 Plus` (store screenshots) and the `WhoCards Duo` foldable AVD (`WhoCards_Duo`). iOS ones are slimmed with simslim (`apps/mobile/simslim.json`, `brew install mobai-app/tap/simslim`) before a run. Never boot, slim or run on a device not named `WhoCards …`: other projects' simulators live on the same Mac.

## Review bots

Greptile and CodeRabbit review on PR open and read their config from `main`. The `skip-pr-bots` label opts a PR out of both.
