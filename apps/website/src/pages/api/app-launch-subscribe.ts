import type {APIRoute} from 'astro'
import {Resend} from 'resend'
import {env} from '~env'
import {
  appWaitlistSchema,
  confirmationEmail,
  confirmationMessage,
} from '~server/app-waitlist'
import {CONSENT_SOURCE, normalizeEmail} from '~server/consent'
import {insertConsent, insertUser} from '~server/db'

// SSR endpoint for the /app waitlist and launch-day reminder capture.
// Modelled on ai-checkin-subscribe.ts — same DB pattern, same error handling.
export const prerender = false

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

export const POST: APIRoute = async ({request}) => {
  const body = await request.json().catch(() => null)
  const parsed = appWaitlistSchema.safeParse(body)

  if (!parsed.success) {
    return json({message: 'Please enter a valid email address.'}, 400)
  }

  const {email: rawEmail, name, newsletter, source} = parsed.data
  const email = normalizeEmail(rawEmail)
  const displayName = name && name.length > 0 ? name : email.split('@')[0]
  const consentSource = source ?? CONSENT_SOURCE.appPage

  // Log source for segmentation (full persistence tracked in #92).
  if (source) {
    console.info('app-launch-subscribe: source=%s email=%s', source, email)
  }

  // Persist the lead. Upsert the user row first (keeps user.newsletter OR-merge
  // compatibility), then write consent rows: app_launch always, newsletter only
  // when the visitor opted in. Don't fail the request if the DB write hiccups —
  // sending the confirmation matters more (#119).
  try {
    const user = await insertUser({
      email,
      name: displayName,
      newsletter,
    })
    const userId = user?.id ?? null

    await insertConsent({
      email,
      name: displayName,
      userId,
      consentType: 'app_launch',
      consentSource,
    })

    if (newsletter) {
      await insertConsent({
        email,
        name: displayName,
        userId,
        consentType: 'newsletter',
        consentSource,
      })
    }
  } catch (error) {
    console.error('app-launch-subscribe: failed to store lead', error)
  }

  if (!env.RESEND_API_KEY) {
    console.error('app-launch-subscribe: RESEND_API_KEY not configured')
    return json({message: 'Email is not configured yet. Please try again later.'}, 503)
  }

  const email_ = confirmationEmail({newsletter})

  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const {error} = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: email_.subject,
      html: email_.html,
    })

    if (error) {
      console.error('app-launch-subscribe: resend error', error)
      return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
    }
  } catch (error) {
    console.error('app-launch-subscribe: send threw', error)
    return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
  }

  return json({message: confirmationMessage({newsletter})}, 200)
}
