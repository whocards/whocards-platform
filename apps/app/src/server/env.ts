import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
)

/**
 * Server-only env for the app (ADR-0008). Unlike apps/website's split env.ts /
 * env.node.ts, this app has no client-exposed vars yet — everything here is only
 * ever read in server code (Nitro/Node runtime), so a single `process.env`-backed
 * module is enough. Optional vars degrade gracefully (see each feature's guard)
 * instead of throwing, per the overnight build's guardrails.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    // Shared Supabase Postgres — same DB as apps/website, additive-only tables.
    DB_URL: z.string().min(1),
    // Signs better-auth session cookies/tokens. Required — generate with
    // `openssl rand -hex 32` and set it in the root .env and on the Netlify site.
    BETTER_AUTH_SECRET: z.string().min(1),
    // Absolute origin this app is served from (no trailing slash), e.g.
    // https://whocards-app.netlify.app. Falls back to localhost in dev.
    BETTER_AUTH_URL: z.string().url().default('http://localhost:3100'),
    // Resend — reused from the existing website/emails setup for the magic-link email.
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().default('WhoCards <hello@whocards.cc>'),
    // The one account seeded as `owner` on first sign-in (see _authed.tsx).
    OWNER_EMAIL: z.string().email().default('avicharlop@gmail.com'),
    // --- optional / env-gated features — absence must degrade, never crash ---
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    ANTHROPIC_API_KEY: optionalString,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

/** True once both Google OAuth env vars are present — gates the Google button/provider. */
export const googleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

/** True once ANTHROPIC_API_KEY is present — gates the discussion-agent feature (slice 5). */
export const agentEnabled = Boolean(env.ANTHROPIC_API_KEY)
