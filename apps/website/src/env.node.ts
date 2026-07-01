import dotEnv from 'dotenv'

/**
 * Env access for Node build/config contexts — `astro.config.ts`, `drizzle.config.ts`
 * — where Vite hasn't started yet, so `import.meta.env` isn't populated. This is the
 * one module allowed to read `process.env` for those contexts (enforced by
 * `node/no-process-env`); the Astro/Vite app runtime instead reads `~env`
 * (`src/env.ts`, t3-env, `import.meta.env`).
 *
 * `src/env.ts` can't be reused here: t3-env eagerly validates every required server
 * var (e.g. `TURNSTILE_SECRET_KEY`) on import, which would throw in a bare Node
 * config process that never sets those — hence this separate, narrower module.
 *
 * Loads the monorepo root `.env` directly, matching the `with-env` scripts
 * (`dotenv -e ../../.env`) and Astro's `vite.envDir: '../../'` — the single source
 * of truth documented in the root `.env.example`. Config files that run outside
 * those wrappers (e.g. `drizzle-kit studio` invoked directly) still get it loaded.
 */
dotEnv.config({path: '../../.env'})

const localhost = 'http://localhost:4321'

/** True in a Netlify build (any context: production, deploy-preview, branch-deploy). */
export const IS_PROD = !!process.env.NETLIFY

/**
 * Absolute site origin. Production builds resolve it from Netlify's deploy-context
 * vars (`CONTEXT`/`URL`/`DEPLOY_PRIME_URL`); everything else (local dev, tests) uses
 * localhost so absolute OG/Twitter image URLs stay stable.
 */
export const SITE_URL: string = IS_PROD
  ? ((process.env.CONTEXT === 'production' ? process.env.URL : process.env.DEPLOY_PRIME_URL) ?? '')
  : localhost

if (!SITE_URL) {
  throw new Error(`env vars messed up: SITE_URL resolved empty (IS_PROD=${IS_PROD})`)
}

/** Postgres connection string for drizzle-kit (build/CLI context only). */
export const DB_URL = process.env.DB_URL ?? ''
