import {z} from 'zod'

// Pure consent + confirmation-copy logic for the /app waitlist capture (#87).
//
// Deliberately free of `~env` / `~server/db` imports so it stays unit-testable
// without a DB connection: importing the db layer news up a Postgres client at
// module load. The SSR route composes this with insertUser + Resend.

export const appWaitlistSchema = z.object({
  // Trim before validating — otherwise a whitespace-padded email is rejected by
  // safeParse before the route's normalizeEmail ever runs.
  email: z.string().trim().email(),
  name: z.string().trim().optional(),
  // Optional and defaults to false. Newsletter consent is granted ONLY when the
  // visitor ticks the box — never inferred from the act of joining the waitlist.
  newsletter: z.boolean().optional().default(false),
  // source is logged for segmentation; not persisted to DB (full source
  // instrumentation tracked in #92 — do not add a column/migration here).
  source: z.string().trim().optional(),
})
// Note: the Cloudflare Turnstile token (`turnstileToken`) is intentionally NOT a
// schema field — like /contact and /request-cards it is always required and
// verified separately server-side (see ~server/turnstile), never optional.

export type AppWaitlistInput = z.infer<typeof appWaitlistSchema>

export type Consent = Readonly<{
  // Whether to write an app_launch consent row. Always true for waitlist signups.
  appLaunch: boolean
  newsletter: boolean
}>

/**
 * The consent a waitlist signup grants. Joining the waitlist always records the
 * one-time `app_launch` consent row; the ongoing `newsletter` consent is recorded
 * only when the visitor opts in. The two are stored as separate email_consent rows
 * and never conflated (#87, #119).
 *
 * Note: the SSR route (app-launch-subscribe.ts) calls upsertConsent directly and
 * does not call resolveConsent at runtime. This function is retained as canonical
 * documentation of the consent model and is exercised by app-waitlist.test.ts.
 */
export const resolveConsent = ({newsletter}: {newsletter?: boolean}): Consent => ({
  appLaunch: true,
  newsletter: newsletter ?? false,
})

/** On-page status message — reflects the consent the visitor actually chose. */
export const confirmationMessage = ({newsletter}: {newsletter: boolean}) =>
  newsletter
    ? "You're on the list — we'll email you at launch. Confirm the occasional WhoCards emails from your inbox."
    : "You're on the list — we'll email you at launch. Nothing else until then."

/**
 * Confirmation email — the WhoCards-branded template. With a newsletter opt-in it
 * carries the double opt-in link (`confirmUrl`); without one, no newsletter is promised.
 */
export const confirmationEmail = ({confirmUrl}: {confirmUrl?: string}) => {
  const consentLine = confirmUrl
    ? `You also asked for occasional WhoCards emails — a good question now and then, plus the odd bit of product news. <a href="${confirmUrl}" style="color:#f9d75f;font-weight:700;">Confirm you want them</a>; until you do, you only get the launch email.`
    : 'Just the one launch email — no newsletter, and nothing else from us until then.'

  const footer = confirmUrl
    ? 'You signed up at whocards.cc/app and asked for our emails. Ignore the confirm link and you only get the launch email.'
    : 'You signed up at whocards.cc/app. No messages until launch.'

  return {
    subject: "You're on the WhoCards app waitlist",
    html: `<!doctype html>
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
          <p style="font-size:15px;line-height:1.6;color:#dcdee9;margin:0 0 18px;">${consentLine}</p>
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
          ${footer}
        </p>
      </div>
    </body>
  </html>`,
  }
}

/** Double opt-in email for a newsletter signup (#360); nothing else is sent until it is confirmed. */
export const newsletterConfirmationEmail = ({confirmUrl}: {confirmUrl: string}) => ({
  subject: 'Confirm your WhoCards emails',
  html: `<!doctype html>
  <html lang="en">
    <body style="background:#08001a;margin:0;padding:32px 12px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="color:#f9d75f;font-size:24px;font-weight:800;margin:0 8px 22px;">
          WhoCards<span style="color:#c058d2;">?</span>
        </div>
        <div style="background:#262432;border-radius:24px;padding:32px 28px;color:#f5f5f5;">
          <h1 style="font-size:30px;line-height:1.2;margin:0 0 20px;">One click and you're in.</h1>
          <p style="font-size:17px;line-height:1.6;margin:0 0 24px;">
            Confirm you want the occasional WhoCards email — a good question now and then, plus the odd bit of product news.
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${confirmUrl}" style="background:#f9d75f;border-radius:999px;color:#111516;display:inline-block;font-size:17px;font-weight:700;padding:15px 28px;text-decoration:none;">Confirm my email</a>
          </p>
          <p style="color:#dcdee9;font-size:13px;line-height:1.6;margin:0;">
            Didn't sign up? Ignore this email and you won't hear from us.
          </p>
        </div>
      </div>
    </body>
  </html>`,
})
