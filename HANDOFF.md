# Monorepo migration — handoff

Branch **`feat/monorepo`** in a git worktree at `/Users/avi/code/whocards/wt-monorepo`
(off `main`, which stays checked out at `/Users/avi/code/whocards/app`). Merge the branch
to bring the monorepo into `app/`.

## What was built (per the ADRs in `docs/adr`)

pnpm + Turborepo monorepo, **oxlint + oxfmt** (no ESLint/Prettier), husky + lint-staged,
`@whocards/*` packages consumed as source via `workspace:*`, shared versions in the pnpm
`catalog:`.

```
apps/website   Astro site, lifted-and-shifts in; mounts the tRPC API at /api/trpc/[trpc]
apps/mobile    Expo SDK 56 + expo-router + NativeWind, on the shared packages
packages/tokens design tokens (colours/spacing/radii/fonts/gradients) + Tailwind preset
packages/decks  the Pool (66 Q × 14 langs) + headless play engine + deck registry
packages/api    host-agnostic tRPC content router (decks.manifest / decks.bySlug / pool.languages)
tooling/typescript shared tsconfig bases
```

### Commits (in order)

1. `chore: scaffold pnpm + turborepo monorepo skeleton`
2. `feat(website): lift-and-shift Astro site into apps/website`
3. `feat(tokens): @whocards/tokens design-token package`
4. `feat(decks): Pool + typed deck model`
5. `feat(decks): headless play engine + deck registry`
6. `fix(tooling): make lint-staged oxfmt tolerate all-ignored batches`
7. `refactor(website): consume @whocards/decks (dedupe play engine + registry)`
8. `feat(api): @whocards/api host-agnostic tRPC router`
9. `feat(website): mount @whocards/api tRPC router at /api/trpc/[trpc]`
10. `feat(mobile): scaffold Expo + NativeWind app on the shared packages`

## Verified green

- `pnpm install` clean (sharp uses prebuilt `@img` binary; build script skipped).
- `apps/website`: `astro build` green (all pages + OG images + Netlify SSR fn), after the
  rewire too. tRPC mount runtime-checked: `decks.manifest`, `decks.bySlug` (200, edge
  `cache-control`), `pool.languages` all serve correctly.
- `turbo typecheck --filter='!website'`: 4/4 (tokens, decks, api, mobile).
- `turbo test`: 30/30 (tokens 6, decks 20, api 4).
- oxlint `--deny-warnings` + oxfmt clean across packages + mobile.

## Outstanding / follow-ups

1. **Mobile runtime verification (the main open item).** Could not run a simulator/Metro
   bundle in the build sandbox — only `tsc`/lint are verified. Next: `pnpm -F mobile start`,
   confirm (a) Metro resolves the `@whocards/*` source packages
   (`resolver.unstable_enablePackageExports` is set), (b) NativeWind loads
   `tailwind.config.ts` (jiti transpiles it + the imported `@whocards/tokens` preset) and
   classes render, (c) the tRPC client reaches the site — run the website on :4321 or set
   `EXPO_PUBLIC_API_URL`. A Maestro E2E starter flow + research/recommendation is ready in
   `apps/mobile/.maestro/library.yml` + `apps/mobile/docs/e2e-testing.md` (run it on a
   simulator as part of this verification).
2. **Website Pool-data dedup.** The rewire deduped the play engine + deck registry only.
   `questions.json` / `languages.json` are still local copies in `apps/website`; repoint the
   direct consumers to `@whocards/decks` pool: `WhoCard.astro`, `pages/[language]/images.astro`,
   `pages/images.astro`, `pages/og/[language]/[id].png.ts`, `server/card-image.ts`,
   `types/index.ts`, `utils/gameplay.ts`, `utils/language.ts`.
3. **Web tokens consumption.** Only mobile consumes `@whocards/tokens`. The web's Tailwind v4
   `@theme` block (`apps/website/src/styles/base.css`) is still hand-written; regenerate it
   from `@whocards/tokens` (small codegen/build step) to make tokens the single source.
4. **Excluded printable PDFs.** `apps/website/public/cards/*.pdf` (~147 MB) were left out to
   keep git lean — see `apps/website/public/cards/README.md` to restore via LFS/external.
5. **Pre-existing website type debt.** `astro check` reports 9 errors (untyped
   bidi-js/wawoff2, loose `.astro` typing, a suspect markup bug at `ai-at-work.astro:96`).
   They predate the migration; the website is excluded from oxlint/oxfmt + `turbo typecheck`
   (keeps its own prettier + `astro check`). Fix them, then fold the site into oxlint/oxfmt.
6. **tRPC ETag.** The mount sets `Cache-Control` only; add `ETag` if stronger revalidation is
   wanted (ADR-0002 mentions both).
7. **Local env.** `apps/website/.env` holds placeholder values (gitignored) so `astro build`
   passes locally; real values needed to deploy.

## Run it

```bash
pnpm install
pnpm -F website dev      # needs apps/website/.env (placeholders present locally)
pnpm -F mobile start     # Expo
pnpm check               # oxfmt --check && oxlint && turbo typecheck test  (website typecheck red until #5)
```
