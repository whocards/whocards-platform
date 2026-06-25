# Releasing the mobile app

A release is a `v*` git tag. Pushing it triggers `.github/workflows/mobile-release.yml`,
which runs the quality gate, then EAS build → submit (TestFlight + Play internal) → OTA.

The whole flow is driven by one command: **`pnpm release`** (release-it +
conventional-changelog). It picks the version, writes the changelog, bumps the app
version, tags, and pushes — with confirmation prompts along the way.

## One-time setup (already done — listed so you can verify)

- **EAS credentials** — iOS App Store Connect API Key and Android service-account key are
  stored on EAS (`eas credentials`). `eas submit` pulls both, authed by `EXPO_TOKEN`.
- **`EXPO_TOKEN`** — GitHub Actions secret. The only CI secret the pipeline needs.
- **iOS build credentials** — distribution cert + provisioning profile on EAS.

## Before each release

1. **Boot a simulator and an emulator.** The release command runs the Maestro e2e suite
   (`e2e:ios` + `e2e:android`) as a hard gate — CI does not run e2e (see `mobile-gate.yml`).
2. **Be on `main`, clean and up to date.** release-it refuses otherwise
   (`requireBranch`, `requireCleanWorkingDir`, `requireUpstream`).
3. **Export a GitHub token** for the release notes (release-it creates a GitHub Release):
   ```sh
   export GITHUB_TOKEN=$(gh auth token)
   ```

## Cut the release

```sh
pnpm release          # interactive: confirms version, commit, tag, push
pnpm release:dry      # preview everything, change nothing
```

What it does, in order:

1. **e2e gate** — `scripts/release/pre-release-check.mjs` runs `e2e:ios` then `e2e:android`.
   Aborts on failure.
2. **Version** — recommended from your conventional commits (`feat` → minor, `fix` → patch,
   `BREAKING CHANGE` → major). You confirm or override.
3. **Changelog** — `CHANGELOG.md`, regenerated for commits **touching `apps/mobile` or
   `packages`** (what's actually in the mobile build — website-only commits are excluded).
4. **App version** — `scripts/release/sync-app-version.mjs` writes the new version into
   `apps/mobile/app.json` (`expo.version`). EAS owns the build number.
5. **Commit + tag + push** — `chore(release): vX.Y.Z`, annotated tag `vX.Y.Z`, pushed after
   you confirm. The push is what triggers CI.
6. **GitHub Release** — created with the changelog section as notes.

### Flags / env

- `RELEASE_SKIP_E2E=1 pnpm release` — skip the e2e gate (no devices booted, or a hotfix
  you've validated another way). Use sparingly.
- `pnpm release minor` / `patch` / `major` — force the bump instead of the recommendation.

## After the tag is pushed

The release pipeline runs **only if** the repo variable `EAS_RELEASE_ENABLED` is `true`.
Until then a `v*` tag runs the quality gate and stops (nothing ships). Enable shipping with:

```sh
gh variable set EAS_RELEASE_ENABLED --body true
```

Then the pipeline builds both platforms and submits:

- **iOS** → TestFlight. Promote to the App Store manually in App Store Connect.
- **Android** → Play **internal** track. Production needs the closed-test requirement met
  first; promote in the Play Console when eligible.
- **OTA** → an `eas update` is published to the `production` channel.
