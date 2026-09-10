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
    // Resend API key for all transactional email (AI Check-In lead magnet, app
    // launch subscribe, contact form). Required: without it prod silently stops
    // sending email, so the build must fail loudly instead (see 2026-07-02 webhook
    // outage — missing Resend env vars shipped to prod unnoticed).
    RESEND_API_KEY: z.string().min(1),
    // Must be a Resend-verified sender. Defaults to the WhoCards domain — verify
    // whocards.cc in Resend (or override this env) before it can email real users.
    RESEND_FROM_EMAIL: z.string().default('WhoCards <hello@whocards.cc>'),
    // Resend Segment (Audience) ids for syncing email_consent rows (#120).
    // Required: when absent, consent sync is a silent no-op and the webhook drops
    // segment-scoped unsubscribes — permanent consent drift, not a graceful degrade.
    RESEND_SEGMENT_NEWSLETTER_ID: z.string().min(1),
    RESEND_SEGMENT_APP_WAITLIST_ID: z.string().min(1),
    // Android Closed Test links used by /android-testers and tester lifecycle emails.
    ANDROID_TESTER_SIGNUP_URL: optionalUrl,
    ANDROID_TESTER_GROUP_URL: optionalUrl,
    ANDROID_TESTER_OPT_IN_URL: optionalUrl,
    ANDROID_TESTER_FEEDBACK_URL: optionalUrl,
    // Svix signing secret for verifying Resend webhook deliveries (#121).
    // Required: when unset every delivery 500s until Resend disables the endpoint
    // entirely (happened 2026-07-02), losing unsubscribe events. Must match the
    // signing_secret from GET https://api.resend.com/webhooks/{id}.
    RESEND_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    // Cloudflare Turnstile — server-side secret protecting the /contact and
    // /request-cards forms. Required: the build fails without it (incl. dev) so bot
    // protection can never be silently dropped by a missing env var.
    TURNSTILE_SECRET_KEY: z.string().min(1),
    // --- Public stats page — all optional, all server-only.
    // Every source degrades gracefully to a "needs credentials" state on the page
    // when unset (see ~server/stats), so none of these gate the build.
    //
    // App Store Connect (iOS installs, Sales/Analytics Reports API). Get these from
    // App Store Connect → Users and Access → Integrations → App Store Connect API:
    // create a key with the "Sales and Reports" role for KEY_ID/PRIVATE_KEY (the
    // .p8 file contents, downloaded once), ISSUER_ID is shown on the same page.
    // VENDOR_NUMBER is the numeric Vendor Number under your account name.
    APP_STORE_CONNECT_KEY_ID: z.string().optional(),
    APP_STORE_CONNECT_ISSUER_ID: z.string().optional(),
    APP_STORE_CONNECT_PRIVATE_KEY: z.string().optional(),
    APP_STORE_CONNECT_VENDOR_NUMBER: z.string().optional(),
    // Google Play (Android installs, Cloud Storage reports bucket). Get these from
    // Play Console → Setup → API access: link/create a Google Cloud service account
    // with a JSON key (SERVICE_ACCOUNT_JSON = the full downloaded file contents),
    // grant it "Viewer" account access, then read the `pubsite_prod_rev_*` bucket
    // name shown under "Download reports" for REPORTS_BUCKET.
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_PLAY_REPORTS_BUCKET: z.string().optional(),
    // PostHog HogQL query API (country split only — everything else on the stats
    // page reads Postgres directly). PERSONAL_API_KEY: PostHog → Settings →
    // Personal → Personal API Keys, scope it to "Query read" only for this project.
    // PROJECT_ID: PostHog → Settings → Project → Project API keys.
    POSTHOG_PERSONAL_API_KEY: z.string().optional(),
    POSTHOG_PROJECT_ID: z.string().optional(),
  },
  clientPrefix: 'PUBLIC_',
  client: {
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://who.whocards.cc'),
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
