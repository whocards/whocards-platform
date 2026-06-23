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
  },
  clientPrefix: 'PUBLIC_',
  client: {
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://eu.i.posthog.com'),
    PUBLIC_POSTHOG_UI_HOST: z.string().url().optional().default('https://eu.posthog.com'),
    // Set to "true" to flip /app from waitlist mode to download mode on launch day.
    PUBLIC_APP_LAUNCHED: z
      .string()
      .optional()
      .default('false')
      .transform((v) => v === 'true' || v === '1'),
  },
  runtimeEnv: import.meta.env,
})
