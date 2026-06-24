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

const buildEmailHtml = () => `<!doctype html>
  <html lang="en">
    <body style="background:#08001a;margin:0;padding:32px 12px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="color:#f9d75f;font-size:24px;font-weight:800;margin:0 8px 22px;">
          WhoCards<span style="color:#c058d2;">?</span>
        </div>
        <div style="background:#262432;border-radius:24px;padding:32px 28px;color:#f5f5f5;">
          <p style="color:#f9d75f;font-size:12px;font-weight:700;letter-spacing:1.5px;margin:0 0 10px;">YOU'RE IN</p>
          <h1 style="font-size:34px;line-height:1.15;letter-spacing:-0.6px;margin:0 0 20px;">We'll bring the download link to you.</h1>
          <p style="font-size:17px;line-height:1.6;margin:0 0 18px;">
            You're on the WhoCards app list. We'll email you once when the app lands in the App Store and Google Play.
          </p>
          <div style="background:#0d051f;border:1px solid #474a69;border-radius:20px;margin:26px 0;padding:24px;">
            <p style="color:#f9d75f;font-size:12px;font-weight:700;letter-spacing:1.5px;margin:0 0 12px;">A QUESTION WHILE YOU WAIT</p>
            <p style="font-size:24px;font-weight:700;line-height:1.35;margin:0;">What is the most interesting thing you have learned recently?</p>
            <p style="color:#dcdee9;font-size:14px;line-height:1.5;margin:10px 0 0;">(About yourself or in general.)</p>
          </div>
          <p style="font-size:17px;line-height:1.6;margin:0 0 24px;">
            You can already play all 66 questions in your browser. No account or install needed.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="https://whocards.cc/play" style="background:#f9d75f;border-radius:999px;color:#111516;display:inline-block;font-size:17px;font-weight:700;padding:15px 28px;text-decoration:none;">Play WhoCards online →</a>
          </p>
          <p style="color:#dcdee9;font-size:13px;line-height:1.6;margin:0;">
            Add <strong style="color:#f5f5f5;">hello@whocards.cc</strong> to your contacts so the launch email doesn't wander into spam.
          </p>
        </div>
        <p style="color:#9698af;font-size:12px;line-height:1.5;margin:20px 8px 0;text-align:center;">
          You signed up at whocards.cc/app. No messages until launch.
        </p>
      </div>
    </body>
  </html>`

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
