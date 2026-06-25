import type {APIRoute} from 'astro'
import {Resend} from 'resend'
import {z} from 'zod'
import questions from '~data/decks/ai-at-work.questions.json'
import {env} from '~env'
import {insertUser} from '~server/db'
import {verifyTurnstile} from '~server/turnstile'

// SSR endpoint for the AI Check-In lead magnet (/ai-at-work). Captures the email
// as a newsletter user (reusing the existing users table — no migration) and
// emails the 10-question starter via Resend.
export const prerender = false

const schema = z.object({
  email: z.string().email(),
  // optional — the landing form is email-only; we derive a name when absent.
  name: z.string().trim().optional(),
})

// 10 starter questions, spread across the deck's four acts (Name the fear /
// Map the work / Redesign the role / Team norms).
const STARTER_IDS = [
  'ai-1',
  'ai-4',
  'ai-7',
  'ai-10',
  'ai-11',
  'ai-16',
  'ai-19',
  'ai-24',
  'ai-28',
  'ai-37',
] as const

const starterQuestions = STARTER_IDS.map(
  (id) => (questions as Record<string, {en: string}>)[id]?.en
).filter((q): q is string => Boolean(q))

const DECK_URL = 'https://whocards.cc/play/ai-at-work'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

const buildEmailHtml = () => {
  const items = starterQuestions
    .map(
      (q) =>
        `<li style="margin:0 0 12px;padding:0;color:#1f1f1f;font-size:16px;line-height:1.5;">${q}</li>`
    )
    .join('')

  return `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f1f1f;">
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Your AI Check-In starter</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
      Ten questions to get your team talking honestly about AI — the fear, what stays human,
      and the norms you want to live by. Pick one, ask it in your next team meeting, and listen.
    </p>
    <ol style="padding-left:20px;margin:0 0 24px;">${items}</ol>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">
      When you're ready for the full deck, run the whole check-in here:
    </p>
    <p style="margin:0 0 24px;">
      <a href="${DECK_URL}" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;font-size:16px;">Run the check-in</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#888;margin:0;">
      You're getting this because you asked for the starter at whocards.cc. Not what you expected? Just ignore this email.
    </p>
  </div>`
}

export const POST: APIRoute = async ({request, clientAddress}) => {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return json({message: 'Please enter a valid email address.'}, 400)
  }

  // Bot protection — verify the Turnstile token server-side before sending any
  // email. Required, like every other WhoCards form. The token is read from the
  // raw body (verified separately, never a schema field).
  const turnstileToken =
    body &&
    typeof body === 'object' &&
    typeof (body as Record<string, unknown>).turnstileToken === 'string'
      ? ((body as Record<string, unknown>).turnstileToken as string)
      : ''
  const turnstile = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientAddress)
  if (!turnstile.ok) {
    return json(
      {
        message:
          turnstile.reason === 'missing-token'
            ? 'Please complete the security check.'
            : 'Security check failed. Please try again.',
      },
      403
    )
  }

  const {email, name} = parsed.data
  const displayName = name && name.length > 0 ? name : email.split('@')[0]

  // Capture the lead (newsletter opt-in). Upserts on email, so resubmits are safe.
  // Don't fail the request if the DB write hiccups — sending the starter matters more.
  try {
    await insertUser({email, name: displayName, newsletter: true})
  } catch (error) {
    console.error('ai-checkin-subscribe: failed to store lead', error)
  }

  if (!env.RESEND_API_KEY) {
    console.error('ai-checkin-subscribe: RESEND_API_KEY not configured')
    return json({message: 'Email is not configured yet. Please try again later.'}, 503)
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const {error} = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Your AI Check-In starter — 10 questions to get your team talking',
      html: buildEmailHtml(),
    })

    if (error) {
      console.error('ai-checkin-subscribe: resend error', error)
      return json({message: "We couldn't send the email just now. Please try again."}, 502)
    }
  } catch (error) {
    console.error('ai-checkin-subscribe: send threw', error)
    return json({message: "We couldn't send the email just now. Please try again."}, 502)
  }

  return json({message: 'Check your inbox — your 10 questions are on the way.'}, 200)
}
