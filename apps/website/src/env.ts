import {createWebsiteEnv} from '@whocards/env/website'

// Astro inlines only the private vars this file names, so every var is read explicitly.
export const env = createWebsiteEnv({
  NODE_ENV: import.meta.env.NODE_ENV,
  CONTEXT: import.meta.env.CONTEXT,
  DB_URL: import.meta.env.DB_URL,
  CONTACTS_SHEET_URL: import.meta.env.CONTACTS_SHEET_URL,
  RESEND_API_KEY: import.meta.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: import.meta.env.RESEND_FROM_EMAIL,
  RESEND_SEGMENT_NEWSLETTER_ID: import.meta.env.RESEND_SEGMENT_NEWSLETTER_ID,
  RESEND_SEGMENT_APP_WAITLIST_ID: import.meta.env.RESEND_SEGMENT_APP_WAITLIST_ID,
  RESEND_WEBHOOK_SECRET: import.meta.env.RESEND_WEBHOOK_SECRET,
  ANDROID_TESTER_SIGNUP_URL: import.meta.env.ANDROID_TESTER_SIGNUP_URL,
  ANDROID_TESTER_GROUP_URL: import.meta.env.ANDROID_TESTER_GROUP_URL,
  ANDROID_TESTER_OPT_IN_URL: import.meta.env.ANDROID_TESTER_OPT_IN_URL,
  ANDROID_TESTER_FEEDBACK_URL: import.meta.env.ANDROID_TESTER_FEEDBACK_URL,
  TURNSTILE_SECRET_KEY: import.meta.env.TURNSTILE_SECRET_KEY,
  OPENAI_API_KEY: import.meta.env.OPENAI_API_KEY,
  PUBLIC_POSTHOG_KEY: import.meta.env.PUBLIC_POSTHOG_KEY,
  PUBLIC_POSTHOG_HOST: import.meta.env.PUBLIC_POSTHOG_HOST,
  PUBLIC_POSTHOG_UI_HOST: import.meta.env.PUBLIC_POSTHOG_UI_HOST,
  PUBLIC_APP_IOS_LAUNCHED: import.meta.env.PUBLIC_APP_IOS_LAUNCHED,
  PUBLIC_APP_ANDROID_LAUNCHED: import.meta.env.PUBLIC_APP_ANDROID_LAUNCHED,
  PUBLIC_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
})
