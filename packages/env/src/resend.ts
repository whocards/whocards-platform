import {z} from 'zod'

/** Transactional email, sent by apps/website, apps/app and apps/emails' scripts. */
export const resendSchema = {
  // Required: without it prod silently stops sending email (2026-07-02 outage).
  RESEND_API_KEY: z.string().min(1),
  // Must be a Resend-verified sender.
  RESEND_FROM_EMAIL: z.string().default('WhoCards <hello@whocards.cc>'),
}

/** Consent sync and its Resend webhook: apps/website only. */
export const resendConsentSchema = {
  // Required: absent ids make consent sync a silent no-op, so consent drifts for good.
  RESEND_SEGMENT_NEWSLETTER_ID: z.string().min(1),
  RESEND_SEGMENT_APP_WAITLIST_ID: z.string().min(1),
  // Must match the signing_secret from GET https://api.resend.com/webhooks/{id}.
  RESEND_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
}
