import type {APIRoute} from 'astro'
import {env} from '~env'
import {db} from '~server/db'
import {
  verifyResendSignature,
  dispatchResendEvent,
  type WebhookHeaders,
} from '~server/resend-webhook'

// SSR-only — never pre-render a webhook receiver.
export const prerender = false

export const POST: APIRoute = async ({request}) => {
  // Read the RAW body string — Svix signs the exact bytes Resend sends.
  const payload = await request.text()

  // Collect required Svix signature headers.
  const headers: WebhookHeaders = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  // Without the signing secret we cannot verify; return 500 so Resend retries
  // later (the secret should be configured once the endpoint is set up).
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.error('resend-webhook: RESEND_WEBHOOK_SECRET is not configured')
    return new Response(JSON.stringify({error: 'Webhook secret not configured'}), {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    })
  }

  // Verify the Svix signature. Bad signatures → 400 (do not mutate anything).
  let event: unknown
  try {
    event = verifyResendSignature({
      secret: env.RESEND_WEBHOOK_SECRET,
      payload,
      headers,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature'
    console.warn('resend-webhook: signature verification failed —', msg)
    return new Response(JSON.stringify({error: 'Invalid signature'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    })
  }

  // Dispatch the verified event. The dispatcher never throws for unknown or
  // irrelevant event types — it returns a summary and we 200 those. The ONLY way
  // to reach this catch is a transient failure applying a real consent change
  // (e.g. a DB error). For an unsubscribe/preferences signal we must NOT swallow
  // that with a 200: Resend would stop retrying and the consent change would be
  // lost forever (permanent drift). Return 500 so Resend retries the delivery.
  try {
    const summary = await dispatchResendEvent(db, event, {
      segmentIds: {
        newsletterSegmentId: env.RESEND_SEGMENT_NEWSLETTER_ID,
        appWaitlistSegmentId: env.RESEND_SEGMENT_APP_WAITLIST_ID,
      },
    })
    return new Response(JSON.stringify({ok: true, ...summary}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  } catch (err) {
    console.error(
      'resend-webhook: dispatch failed applying a verified event — returning 500 so Resend retries',
      err
    )
    return new Response(JSON.stringify({ok: false, error: 'Internal dispatch error'}), {
      status: 500,
      headers: {'Content-Type': 'application/json'},
    })
  }
}
