# Website: remove commerce/shipping (Stripe, Egon, OpenCollective) — keep only Request Cards form

**Tags:** web, cleanup, removal, env
**Surfaces:** web (`apps/website`)
**Status:** **DONE** (`8dc97eb`; merged to `main`). Reviewer APPROVED. Raised 2026-06-21.

## Context

WhoCards no longer sells/ships through the website — cards are requested via the **Request
Cards form** (`/contact`). The Stripe checkout, the Egon/Zen shipping integration, the
OpenCollective webhook, and the purchase/preorder/gift/thanks pages are all dead weight, and
their env vars are why the root-`.env` consolidation stalled (see the env-consolidation work).
Removing them shrinks the website's required env to a handful and unblocks that consolidation.

## Goal

The website keeps marketing + play + print + the Request Cards form (and the AI Check-In lead
magnet), with **all** Stripe / shipping / purchase code, endpoints, and env vars gone. `pnpm check`

- `astro build` pass; the contact form, play, print, OG images, and conference tracking still work.

## Remove

- **Stripe:** `server/stripe.ts`, `api/stripe-webhook.ts`; env `STRIPE_PRIVATE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRODUCTS`, `PUBLIC_STRIPE_PUBLIC_KEY`; dep `@stripe/react-stripe-js`.
- **Egon/Zen shipping:** `server/egon/*`, `api/_egon/test.ts`; env `EGON_*`, `ZEN_API_KEY`, `ZEN_API_URL`.
- **OpenCollective:** `api/oc-webhook.ts`, `server/graphql.ts`; env `OC_API_KEY`, `OC_API_URL`,
  `OC_URL`, `OC_PRODUCT_IDS`, `OC_REDIRECT_URL`; `WEBHOOK_AUTH_TOKEN` (verify it's only the stripe/oc
  webhook guard).
- **Pages:** `purchase.astro`, `preorder.astro`, `gift.astro`, `thanks.astro` (post-purchase
  order/shipping confirmation).
- **Components:** `components/thanks/ShippingForm.astro`, `OrderDetails.astro`, and `components/Purchase/*`
  — **verify usage first**: keep/relocate anything a retained page (e.g. the homepage) imports
  (Testimonials/Usage/WhatCard may be general marketing); remove the purchase/preorder-only ones.
- **Sheets:** `createPurchaseSheetRow` + `PURCHASE_SHEET_URL`, and any shipping sheet + `SHIPPING_SHEET_URL`.
- **DB queries** in `server/db/index.ts`: purchase/shipping helpers (`getPurchase*`, `insert/updateShipping*`,
  `insertPurchase`) and their exported types. `csv.ts` if it's purchase/shipping-only.
- **Constants:** `products.ts`, purchase/shipping bits of `urls.ts` / `faqs.ts` / `usage.ts`, and the
  purchase/preorder/gift entries in `navigation.ts`.

## Keep

- **Request Cards form:** `contact.astro`, `components/thanks/EmailForm.astro` (used in `mode='request'`),
  `FormSuccess.astro`, `components/thanks/index.ts`, `createContactSheetRow` + `CONTACTS_SHEET_URL`,
  `insertUser` + the `users` table, `cardRequestSchema`.
- **AI Check-In lead magnet:** `api/ai-checkin-subscribe.ts` + Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`).
- Play, print, OG images (`card-image.ts`), conference tracking (`api/events/question-tracking.ts`),
  the Answer record (`api/trpc`), health, marketing pages, PostHog (`PUBLIC_POSTHOG_*`).

## Defer (do NOT do here)

- **Dropping the commerce DB tables** (`purchase`, `shipping`, `whocards_purchase`, `whocards_shipping`,
  and any unused `auth_*`/`account_*` sets). Removing them from `schema.ts` would make `drizzle-kit
generate` propose destructive DROPs against prod. **Keep the table definitions for now** (unused) so
  `generate` stays clean; do the actual drops in a deliberate, reviewed migration under ticket 0005.

## Acceptance

- `grep -riE 'stripe|egon|\bzen\b|opencollective|oc-webhook'` in `src` is clean (only this ticket's removals).
- `env-secrets.ts` lists only: `DB_URL`, `CONTACTS_SHEET_URL`, `RESEND_*`, `PUBLIC_POSTHOG_*` (+ runtime
  `NODE_ENV`/`CONTEXT`); no dangling references to removed vars.
- `pnpm --filter website typecheck` + `astro build` pass; `drizzle-kit generate` still reports **no schema changes**.
- `/contact` (Request Cards), `/play`, `/print`, OG images, `/ai-at-work` subscribe all still work.

## Notes

- This unblocks the single root-`.env` consolidation (vionlabs pattern) — a follow-up once the env list is slim.

## References

- `src/pages/api/`, `src/server/`, `src/pages/{purchase,preorder,gift,thanks}.astro`,
  `src/components/{Purchase,thanks}/`, `src/server/db/{index,schema}.ts`, `src/env-secrets.ts`,
  `src/constants/`, tickets 0005 (DB migrations) + the env-consolidation work
