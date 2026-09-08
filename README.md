# WhoCards

Monorepo for WhoCards — the conversation game. See [CONTEXT.md](./CONTEXT.md) for the
product glossary and [docs/adr](./docs/adr) for the architecture decisions.

## Layout

```
apps/
  website/   Astro marketing + play site (the host that mounts the API — ADR-0002)
  mobile/    Expo + NativeWind React Native app
  emails/    React Email templates + guarded Resend delivery helpers
packages/
  tokens/    @whocards/tokens — design tokens shared by web + mobile
  decks/     @whocards/decks — Pool data + headless play engine (ADR-0003)
  api/       @whocards/api — host-agnostic tRPC router (ADR-0002)
tooling/
  typescript/  @whocards/typescript-config — shared tsconfig bases
```

Internal packages are `@whocards/*`, consumed as source via `workspace:*` (no build step
needed to consume — `exports` points at `src/index.ts`). Shared dependency versions live in
the pnpm `catalog:` in [pnpm-workspace.yaml](./pnpm-workspace.yaml).

## Skills

Agent skills that encode WhoCards editorial judgement live in [skills/](./skills). They are
symlinked into `.claude/skills/` and `.agents/skills/`, so Claude Code and Codex pick them up
automatically inside this checkout. To use one outside the repo (any agent supported by the
[skills CLI](https://github.com/vercel-labs/skills)):

```bash
npx skills add whocards/whocards-platform --skill whocards-questions
```

- **[whocards-questions](skills/whocards-questions/README.md)** — write or revise questions and writing prompts in the WhoCards voice. See its README for installation from this checkout and its [evaluation report](evals/whocards-questions/REPORT.md) for tested behavior.

## Toolchain

- **pnpm** workspaces + version catalog
- **Turborepo** for the task graph (`build` / `dev` / `typecheck` / `test`)
- **oxlint** + **oxfmt** for lint + format (not ESLint/Prettier)
- **TypeScript** strict, ESM everywhere
- type-safe env via per-package `keys.ts` (t3-env + zod)

## Commands

```bash
pnpm install
pnpm dev          # turbo dev across apps
pnpm build        # turbo build
pnpm email:dev    # React Email preview server
pnpm email:render # Render HTML + plain-text email artifacts
pnpm typecheck    # tsc --noEmit per package
pnpm test         # vitest per package
pnpm lint         # oxlint
pnpm format:fix   # oxfmt --write
```
