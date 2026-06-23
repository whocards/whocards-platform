import type {APIRoute} from 'astro'
import {Resend} from 'resend'
import {z} from 'zod'
import {env} from '~env'
import {insertUser} from '~server/db'

// SSR endpoint for the /app waitlist and launch-day reminder capture.
// Modelled on ai-checkin-subscribe.ts — same DB pattern, same error handling.
export const prerender = false

const schema = z.object({
  email: z.string().email(),
  name: z.string().trim().optional(),
  // source is logged for segmentation; not persisted to DB (full source
  // instrumentation tracked in #92 — do not add a column/migration here).
  source: z.string().trim().optional(),
})

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

const buildEmailHtml = () => `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f1f1f;">
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">You're on the list.</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      Thanks for signing up — we'll send you the download link the moment WhoCards lands
      in the App Store and Google Play.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      In the meantime, you can already play WhoCards in your browser at
      <a href="https://whocards.cc/play" style="color:#6c5ce7;">whocards.cc/play</a> — all 66
      questions, no install needed.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">
      To make sure our launch email reaches you, add
      <strong>hello@whocards.cc</strong> to your contacts now. Email clients sometimes
      send first-time senders to spam — we'd hate for you to miss it.
    </p>
    <p style="font-size:13px;line-height:1.6;color:#888;margin:0;">
      You're getting this because you signed up at whocards.cc/app. Not what you expected?
      Just ignore this email — no further messages until launch.
    </p>
  </div>`

export const POST: APIRoute = async ({request}) => {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return json({message: 'Please enter a valid email address.'}, 400)
  }

  const {email, name, source} = parsed.data
  const displayName = name && name.length > 0 ? name : email.split('@')[0]

  // Log source for segmentation (full persistence tracked in #92).
  if (source) {
    console.info('app-launch-subscribe: source=%s email=%s', source, email)
  }

  // Persist the lead. Upserts on email, so resubmits are safe.
  // Don't fail the request if the DB write hiccups — sending the confirmation matters more.
  try {
    await insertUser({email, name: displayName, newsletter: true})
  } catch (error) {
    console.error('app-launch-subscribe: failed to store lead', error)
  }

  if (!env.RESEND_API_KEY) {
    console.error('app-launch-subscribe: RESEND_API_KEY not configured')
    return json({message: 'Email is not configured yet. Please try again later.'}, 503)
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const {error} = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "You're on the WhoCards app waitlist",
      html: buildEmailHtml(),
    })

    if (error) {
      console.error('app-launch-subscribe: resend error', error)
      return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
    }
  } catch (error) {
    console.error('app-launch-subscribe: send threw', error)
    return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
  }

  return json({message: "You're on the list — we'll email you when it's live."}, 200)
}
