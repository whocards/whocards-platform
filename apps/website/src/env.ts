import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional()
)

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
    // Resend Segment (Audience) ids for syncing email_consent rows (#120).
    // Both are optional — when absent, sync for that consent type is a logged no-op.
    RESEND_SEGMENT_NEWSLETTER_ID: z.string().optional(),
    RESEND_SEGMENT_APP_WAITLIST_ID: z.string().optional(),
    // Android Closed Test links used by /android-testers and tester lifecycle emails.
    ANDROID_TESTER_SIGNUP_URL: optionalUrl,
    ANDROID_TESTER_GROUP_URL: optionalUrl,
    ANDROID_TESTER_OPT_IN_URL: optionalUrl,
    ANDROID_TESTER_FEEDBACK_URL: optionalUrl,
    // Svix signing secret for verifying Resend webhook deliveries (#121).
    // Format: whsec_<base64>. Optional so builds/dev don't break without it;
    // the webhook route returns 500 when unset (can't verify) so Resend will retry.
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    // Cloudflare Turnstile — server-side secret protecting the /contact and
    // /request-cards forms. Required: the build fails without it (incl. dev) so bot
    // protection can never be silently dropped by a missing env var.
    TURNSTILE_SECRET_KEY: z.string().min(1),
  },
  clientPrefix: 'PUBLIC_',
  client: {
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://eu.i.posthog.com'),
    PUBLIC_POSTHOG_UI_HOST: z.string().url().optional().default('https://eu.posthog.com'),
    // iOS and Android launch on separate timelines: iOS is approved and public,
    // Android trails by Google's mandatory 12-tester / 14-day Closed Test. Each
    // store has its own switch so /app can offer a real download for one platform
    // while routing the other into the closed test.
    //
    // Set to "true" once the iOS App Store listing is live (default true — iOS is
    // approved and the public download surface today).
    PUBLIC_APP_IOS_LAUNCHED: z.stringbool().default(true),
    // Set to "true" once the Google Play listing is public (default false — Android
    // is still in Closed Testing; until then /app sends Android visitors to the
    // /android-testers funnel instead of a Play badge).
    PUBLIC_APP_ANDROID_LAUNCHED: z.stringbool().default(false),
    // Cloudflare Turnstile — client-side site key for the form widgets. Required
    // (build fails without it) so the widget always renders. Use Cloudflare's
    // always-passing test keys for local dev.
    PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  },
  runtimeEnv: import.meta.env,
})
