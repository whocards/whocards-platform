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

  // Dispatch the verified event. Wrap in try/catch so a handler bug on a valid
  // delivery does not produce an infinite retry loop from Resend.
  // We return 200 for all unknown/irrelevant types, and also for handler
  // errors on valid deliveries (logged). The only acceptable reason to return
  // 500 after a verified signature would be a transient DB error — kept simple
  // here: we log and 200 to avoid retry storms on any non-transient bug.
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
    console.error('resend-webhook: dispatch threw (non-fatal, returning 200 to avoid retry storm)', err)
    return new Response(JSON.stringify({ok: false, error: 'Internal dispatch error'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  }
}
