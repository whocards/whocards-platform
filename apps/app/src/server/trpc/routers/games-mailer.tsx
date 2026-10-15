import {
  GameRecapEmail,
  gameRecapSubject,
  gameRecapText,
  GameRevisitEmail,
  gameRevisitSubject,
  gameRevisitText,
} from '@whocards/emails'
import {sendEmailBatch} from '@whocards/emails/resend'
import type {BatchEmail} from '@whocards/emails/resend'

import {env} from '@whocards/env/app'
import type {SendRecaps, SendResult, SendRevisits} from './games'

const sendBatch = async (emails: BatchEmail[]): Promise<SendResult> => {
  const result = await sendEmailBatch({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    emails,
  })
  return {sent: result.sent, failed: result.failed, error: result.errors[0] ?? null}
}

export const sendRecapsWithResend: SendRecaps = (recaps) =>
  sendBatch(
    recaps.map((r) => ({
      to: r.to,
      subject: gameRecapSubject,
      html: <GameRecapEmail {...r.props} />,
      text: gameRecapText(r.props),
    }))
  )

export const sendRevisitsWithResend: SendRevisits = (revisits) =>
  sendBatch(
    revisits.map((r) => ({
      to: r.to,
      subject: gameRevisitSubject,
      html: <GameRevisitEmail {...r.props} />,
      text: gameRevisitText(r.props),
    }))
  )
