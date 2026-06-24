import {z} from 'zod'

// Pure consent + confirmation-copy logic for the /app waitlist capture (#87).
//
// Deliberately free of `~env` / `~server/db` imports so it stays unit-testable
// without a DB connection: importing the db layer news up a Postgres client at
// module load. The SSR route composes this with insertUser + Resend.

export const appWaitlistSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().optional(),
  // Optional and defaults to false. Newsletter consent is granted ONLY when the
  // visitor ticks the box — never inferred from the act of joining the waitlist.
  newsletter: z.boolean().optional().default(false),
  // source is logged for segmentation; not persisted to DB (full source
  // instrumentation tracked in #92 — do not add a column/migration here).
  source: z.string().trim().optional(),
})

export type AppWaitlistInput = z.infer<typeof appWaitlistSchema>

export type Consent = Readonly<{appWaitlist: boolean; newsletter: boolean}>

/**
 * The consent a waitlist signup grants. Joining the waitlist always records the
 * one-time app-launch notification consent (`appWaitlist`); the ongoing
 * `newsletter` consent is granted only when the visitor opts in. The two are
 * stored separately and never conflated (#87).
 */
export const resolveConsent = ({newsletter}: {newsletter?: boolean}): Consent => ({
  appWaitlist: true,
  newsletter: newsletter ?? false,
})

/** On-page status message — reflects the consent the visitor actually chose. */
export const confirmationMessage = ({newsletter}: {newsletter: boolean}) =>
  newsletter
    ? "You're on the list — we'll email you at launch, plus the occasional good question."
    : "You're on the list — we'll email you at launch. Nothing else until then."

/**
 * Confirmation email — the WhoCards-branded template, with the consent-specific
 * lines branched so an app-only subscriber is never promised newsletter content
 * and an opted-in subscriber is told exactly what they signed up for.
 */
export const confirmationEmail = ({newsletter}: {newsletter: boolean}) => {
  const consentLine = newsletter
    ? 'You also opted in to occasional WhoCards emails — a good question now and then, plus the odd bit of product news. Unsubscribe anytime.'
    : 'Just the one launch email — no newsletter, and nothing else from us until then.'

  const footer = newsletter
    ? 'You signed up at whocards.cc/app and opted in to our emails. Unsubscribe anytime.'
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
