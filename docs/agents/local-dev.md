# Local dev

## Setup

```sh
pnpm install
pnpm dev            # every app; or pnpm dev:web, pnpm dev:mobile, pnpm --filter app dev (port 3100)
```

A new worktree runs `pnpm wt:setup`: it copies the main checkout's `.env` and refuses one whose `DB_URL` isn't a local database.

## Env files

- `.env`: local dev. `DB_URL` is the Docker Postgres `whocards-pg` on `localhost:5435`.
- `.env.prod`: production, used only with `ENV=prod pnpm …`, by a person.
- `.env.preview`: the Neon preview branch, for migrating it: `ENV=preview pnpm --filter website db:migrate`, then the same for `app`.
- `.env.example` lists every variable and which app needs it.

A new variable goes in `packages/env` for its app. For the website, also add it to the explicit list in `apps/website/src/env.ts`: Astro inlines only private vars named in the same file as `import.meta.env`.

## Local database

```sh
docker start whocards-pg                      # created once; data in the whocards-pg volume
pnpm --filter website db:migrate && pnpm --filter app db:migrate
```

Website migrations first: both apps share one migrations table, and a migration dated before the newest recorded one is skipped.

## Netlify

- Two sites: `whocards-calmly` (website, base `apps/website`) and `whocards-app` (app, base `apps/app`). Each deploys only when files under its base dir change; a root-only change, even `pnpm-lock.yaml`, deploys neither.
- Env vars are per context. Production holds the real values; deploy previews and branch deploys get the Neon preview DB, their own `BETTER_AUTH_SECRET`, no Google and Cloudflare's Turnstile test keys.
- App previews take their auth URL from `DEPLOY_PRIME_URL`, inlined at build time (`apps/app/vite.config.ts`).

## Mac gotchas

- No `jq`: use `gh --jq` or node.
- zsh aborts on an unmatched glob: quote globs or use `git grep`.
