import {createEnv} from '@t3-oss/env-core'
import {z} from 'zod'

const stripeIds = z.object({
  price: z.string(),
  shipping: z.string(),
})

export const env = createEnv({
  server: {
    WEBHOOK_AUTH_TOKEN: z.string(),
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    CONTEXT: z.string().optional(),
    OC_API_KEY: z.string(),
    OC_API_URL: z.string(),
    OC_URL: z.string(),
    OC_PRODUCT_IDS: z.string().transform((val: string) => val.split(',')),
    OC_REDIRECT_URL: z.string().optional(),
    ZEN_API_KEY: z.string(),
    ZEN_API_URL: z.string(),
    DB_URL: z.string(),
    PURCHASE_SHEET_URL: z.string(),
    SHIPPING_SHEET_URL: z.string(),
    CONTACTS_SHEET_URL: z.string(),
    STRIPE_PRIVATE_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),
    STRIPE_PRODUCTS: z.string().transform((val) =>
      z
        .object({
          1: stripeIds,
          2: stripeIds,
          5: stripeIds,
          12: stripeIds,
        })
        .parse(JSON.parse(val))
    ),
    EGON_AUTH_ID: z.string(),
    EGON_AUTH_KEY: z.string(),
    EGON_AUTH_TOKEN: z.string(),
    EGON_SHOP_ID: z.coerce.number(),
    EGON_ITEM_ONE_ID: z.coerce.number(),
    EGON_ITEM_ONE_PRICE: z.coerce.number(),
    EGON_ITEM_TWELVE_ID: z.coerce.number(),
    EGON_ITEM_TWELVE_PRICE: z.coerce.number(),
    // Resend (AI Check-In lead-magnet email). Optional so builds/dev don't break
    // before the key is configured; the API route degrades gracefully without it.
    RESEND_API_KEY: z.string().optional(),
    // Must be a Resend-verified sender. Defaults to the WhoCards domain — verify
    // whocards.cc in Resend (or override this env) before it can email real users.
    RESEND_FROM_EMAIL: z.string().default('WhoCards <hello@whocards.cc>'),
  },
  clientPrefix: 'PUBLIC_',
  client: {
    PUBLIC_STRIPE_PUBLIC_KEY: z.string(),
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://eu.i.posthog.com'),
  },
  runtimeEnv: import.meta.env,
})
