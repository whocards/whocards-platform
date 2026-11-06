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
- E2E: Maestro flows in `apps/mobile/.maestro`, see [apps/mobile/docs/e2e-testing.md](../../apps/mobile/docs/e2e-testing.md) and [docs/mobile/device-testing.md](../mobile/device-testing.md). They run only on Avi's Mac with a simulator or emulator.

## Review bots

Greptile and CodeRabbit review on PR open and read their config from `main`. The `skip-pr-bots` label opts a PR out of both.
