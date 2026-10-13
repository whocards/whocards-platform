import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

import {coreSchema, dbSchema} from './core'
import {resendConsentSchema, resendSchema} from './resend'

type RuntimeEnv = Record<string, string | boolean | number | undefined>

/** apps/website. Takes Astro's `import.meta.env`, which only the app's own Vite build can supply. */
export function createWebsiteEnv(runtimeEnv: RuntimeEnv) {
  return createEnv({
    server: {
      ...coreSchema,
      ...dbSchema,
      ...resendSchema,
      ...resendConsentSchema,
      CONTEXT: z.string().optional(),
      CONTACTS_SHEET_URL: z.string().min(1),
      // Android Closed Test links used by /android-testers and tester lifecycle emails.
      ANDROID_TESTER_SIGNUP_URL: z.url().optional(),
      ANDROID_TESTER_GROUP_URL: z.url().optional(),
      ANDROID_TESTER_OPT_IN_URL: z.url().optional(),
      ANDROID_TESTER_FEEDBACK_URL: z.url().optional(),
      // Required, dev included, so bot protection on the forms can't silently drop.
      TURNSTILE_SECRET_KEY: z.string().min(1),
      // Workshop game transcription; unset: dev/preview fake it, production answers 503.
      OPENAI_API_KEY: z.string().optional(),
    },
    clientPrefix: 'PUBLIC_',
    client: {
      PUBLIC_POSTHOG_KEY: z.string().optional(),
      PUBLIC_POSTHOG_HOST: z.url().default('https://who.whocards.cc'),
      PUBLIC_POSTHOG_UI_HOST: z.url().default('https://eu.posthog.com'),
      // Per-store switches: /app offers a real download for a launched store and
      // routes the other into its closed test (Android: /android-testers).
      PUBLIC_APP_IOS_LAUNCHED: z.stringbool().default(true),
      PUBLIC_APP_ANDROID_LAUNCHED: z.stringbool().default(false),
      // Use Cloudflare's always-pass test keys locally.
      PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  })
}
