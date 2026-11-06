import type {APIRoute} from 'astro'
import {z} from 'zod'
import {env} from '~env'
import {newsletterConfirmationEmail} from '~server/app-waitlist'
import {CONSENT_SOURCE, normalizeEmail} from '~server/consent'
import {startDoubleOptIn} from '~server/double-opt-in'
import {TURNSTILE_ACTION, turnstileMessageFor, verifyTurnstile} from '~server/turnstile'

export const prerender = false

const schema = z.object({
  email: z.string().trim().max(254).email(),
  turnstileToken: z.string().default(''),
})

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

export const POST: APIRoute = async ({request, clientAddress, url}) => {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({message: 'Please enter a valid email address.'}, 400)
  }

  const turnstile = await verifyTurnstile(parsed.data.turnstileToken, env.TURNSTILE_SECRET_KEY, {
    action: TURNSTILE_ACTION.newsletter,
    hostname: url.hostname,
    remoteip: clientAddress,
  })
  if (!turnstile.ok) {
    return json({message: turnstileMessageFor(turnstile.reason)}, 403)
  }

  return startDoubleOptIn({
    consent: {
      email: normalizeEmail(parsed.data.email),
      consentType: 'newsletter',
      consentSource: CONSENT_SOURCE.footer,
    },
    origin: url.origin,
    confirmationEmail: newsletterConfirmationEmail,
    caller: 'newsletter-subscribe',
  })
}
