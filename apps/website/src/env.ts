import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    CONTEXT: z.string().optional(),
    DB_URL: z.string(),
    CONTACTS_SHEET_URL: z.string(),
    // Resend (AI Check-In lead-magnet email). Optional so builds/dev don't break
    // before the key is configured; the API route degrades gracefully without it.
    RESEND_API_KEY: z.string().optional(),
    // Must be a Resend-verified sender. Defaults to the WhoCards domain — verify
    // whocards.cc in Resend (or override this env) before it can email real users.
    RESEND_FROM_EMAIL: z.string().default('WhoCards <hello@whocards.cc>'),
    // Cloudflare Turnstile — server-side secret for /contact form bot protection.
    // Optional in dev: the contact route degrades gracefully when not set.
    TURNSTILE_SECRET_KEY: z.string().optional(),
  },
  clientPrefix: 'PUBLIC_',
  client: {
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://eu.i.posthog.com'),
    PUBLIC_POSTHOG_UI_HOST: z.string().url().optional().default('https://eu.posthog.com'),
    // Cloudflare Turnstile — client-side site key for the /contact form widget.
    // Optional in dev: the widget is skipped when not set.
    PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
})
