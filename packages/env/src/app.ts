import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

import {coreSchema} from './core'
import {dbSchema} from './db'
import {resendSchema} from './resend'

/** apps/app (WhoCards @ Work, ADR-0008): server-only, read in the Nitro/Node runtime. */
export const env = createEnv({
  server: {
    ...coreSchema,
    ...dbSchema,
    ...resendSchema,
    // Signs better-auth session cookies/tokens: `openssl rand -hex 32`.
    BETTER_AUTH_SECRET: z.string().min(1),
    // Dev/test origin only: production always signs in on https://app.whocards.cc (auth.tsx).
    BETTER_AUTH_URL: z.url().default('http://localhost:3100'),
    // The one account seeded as `owner` on first sign-in (see _authed.tsx).
    OWNER_EMAIL: z.email().default('avicharlop@gmail.com'),
    // Optional features: absence hides them, never crashes.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export const googleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

export const agentEnabled = Boolean(env.ANTHROPIC_API_KEY)
