import {logError} from '@whocards/observability'
import {Resend} from 'resend'
import {env} from '~env'
import type {ConfirmableConsentType} from '~server/consent'
import {insertConsent} from '~server/db'
import type {ConsentCreate} from '~server/db'
import {newsletterConfirmUrl} from '~server/newsletter-token'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})

// Records an unconfirmed consent and emails its double opt-in link (#360, #391); the address
// reaches Resend only once /newsletter/confirm runs.
export const startDoubleOptIn = async ({
  consent,
  origin,
  confirmationEmail,
  caller,
}: {
  consent: Omit<ConsentCreate, 'confirmed' | 'consentType'> & {consentType: ConfirmableConsentType}
  origin: string
  confirmationEmail: (opts: {confirmUrl: string}) => {subject: string; html: string}
  caller: string
}) => {
  try {
    await insertConsent({...consent, confirmed: false})
  } catch (error) {
    logError(`${caller}: failed to store consent`, error)
    return json({message: "We couldn't save your signup. Please try again."}, 503)
  }

  const {subject, html} = confirmationEmail({
    confirmUrl: newsletterConfirmUrl(
      origin,
      consent.email,
      env.RESEND_WEBHOOK_SECRET,
      consent.consentType
    ),
  })
  try {
    const {error} = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: consent.email,
      subject,
      html,
    })
    if (error) {
      logError(`${caller}: resend error`, error)
      return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
    }
  } catch (error) {
    logError(`${caller}: send threw`, error)
    return json({message: "We couldn't send the confirmation email. Please try again."}, 502)
  }

  return json({message: 'Check your inbox and click the link to confirm.'}, 200)
}
