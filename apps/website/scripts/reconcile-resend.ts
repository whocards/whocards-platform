#!/usr/bin/env tsx
// Reconcile email_consent rows with Resend Contacts (#120).
//
// SAFETY: DRY-RUN by default. Pass --apply to perform writes.
//         Never sends a Broadcast. Never bulk-emails.
//
// Usage:
//   pnpm --filter website reconcile:resend             # dry-run
//   pnpm --filter website reconcile:resend -- --apply  # real writes

import {drizzle} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {Resend} from 'resend'
import * as schema from '../src/server/db/schema'
import {upsertConsent} from '../src/server/db/upsert'
import {makeSegmentIdResolver, reconcile} from '../src/server/resend-sync'

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const apply = args.includes('--apply')

console.log(
  apply ? '[reconcile-resend] APPLY mode.' : '[reconcile-resend] DRY-RUN (pass --apply to write).'
)

// ---------------------------------------------------------------------------
// Env (manual read — runs outside Astro/t3-env)
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const DB_URL = process.env['DB_URL']
const RESEND_SEGMENT_NEWSLETTER_ID = process.env['RESEND_SEGMENT_NEWSLETTER_ID']
const RESEND_SEGMENT_APP_WAITLIST_ID = process.env['RESEND_SEGMENT_APP_WAITLIST_ID']

if (!DB_URL) {
  console.error('[reconcile-resend] DB_URL is required.')
  process.exit(1)
}

if (!RESEND_API_KEY && apply) {
  console.error('[reconcile-resend] RESEND_API_KEY is required in --apply mode.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// DB + deps setup
// ---------------------------------------------------------------------------

const client = postgres(DB_URL)
const db = drizzle(client, {schema})

const segmentIdFor = makeSegmentIdResolver(
  RESEND_SEGMENT_NEWSLETTER_ID,
  RESEND_SEGMENT_APP_WAITLIST_ID
)

// Resend contacts port — only used in --apply mode; never constructed in dry-run.
const buildResendContacts = () => {
  const resend = new Resend(RESEND_API_KEY!)
  return {
    create: (payload: Parameters<typeof resend.contacts.create>[0]) =>
      resend.contacts.create(payload),
    get: (options: {email: string}) => resend.contacts.get(options),
    addToSegment: (options: {email: string; segmentId: string}) =>
      resend.contacts.segments.add(options),
  }
}

// Stub used in dry-run — no Resend calls; satisfies the port type but never called.
const dryRunContacts = {
  create: async () => ({data: null, error: {name: 'dry_run', message: 'dry-run'}}) as const,
  get: async () => ({data: null, error: {name: 'dry_run', message: 'dry-run'}}) as const,
  addToSegment: async () => ({data: null, error: {name: 'dry_run', message: 'dry-run'}}) as const,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const resendContacts = apply ? buildResendContacts() : dryRunContacts

  const counts = await reconcile({
    db,
    deps: {resendContacts, segmentIdFor},
    apply,
    upsertConsentFn: async (database, {email, name, userId}) => {
      const row = await upsertConsent(database, {
        email,
        name,
        userId,
        consentType: 'newsletter',
        consentSource: 'legacy_user_newsletter',
      })
      return row
    },
  })

  console.log(
    '[reconcile-resend] Done. scanned=%d %s=%d skipped=%d failed=%d',
    counts.scanned,
    apply ? 'synced' : 'wouldSync',
    apply ? counts.synced : counts.wouldSync,
    counts.skipped,
    counts.failed
  )

  await client.end()
}

main().catch((err) => {
  console.error('[reconcile-resend] Fatal:', err)
  process.exit(1)
})
