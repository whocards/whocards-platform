import {logError} from '@whocards/observability'
import type {APIRoute} from 'astro'
import {Resend} from 'resend'
import {z} from 'zod'
import {env} from '~env'
import {newsletterConfirmationEmail} from '~server/app-waitlist'
import {CONSENT_SOURCE, normalizeEmail} from '~server/consent'
import {insertConsent} from '~server/db'
import {newsletterConfirmUrl} from '~server/newsletter-token'
import {TURNSTILE_ACTION, turnstileMessageFor, verifyTurnstile} from '~server/turnstile'

// Footer newsletter signup (#360): records an unconfirmed newsletter consent and emails
// the double opt-in link; the address reaches Resend only once /newsletter/confirm runs.
export const prerender = false

const schema = z.object({email: z.string().trim().email(), turnstileToken: z.string().default('')})

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

  const email = normalizeEmail(parsed.data.email)
  try {
    await insertConsent({
      email,
      consentType: 'newsletter',
      consentSource: CONSENT_SOURCE.footer,
      confirmed: false,
    })
  } catch (error) {
    logError('newsletter-subscribe: failed to store consent', error)
    return json({message: "We couldn't save your signup. Please try again."}, 503)
  }

  const {subject, html} = newsletterConfirmationEmail({
    confirmUrl: newsletterConfirmUrl(url.origin, email, env.RESEND_WEBHOOK_SECRET),
  })
  try {
    const {error} = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html,
    })
    if (error) {
      logError('newsletter-subscribe: resend error', error)
      return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
    }
  } catch (error) {
    logError('newsletter-subscribe: send threw', error)
    return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
  }

  return json({message: 'Check your inbox and click the link to confirm.'}, 200)
}
