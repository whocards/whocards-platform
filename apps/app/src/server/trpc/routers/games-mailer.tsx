import {GameRecapEmail, gameRecapSubject, gameRecapText} from '@whocards/emails'
import {sendEmailBatch} from '@whocards/emails/resend'

import {env} from '../../env'
import type {SendRecaps} from './games'

export const sendRecapsWithResend: SendRecaps = async (recaps) => {
  const result = await sendEmailBatch({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    emails: recaps.map((r) => ({
      to: r.to,
      subject: gameRecapSubject,
      html: <GameRecapEmail {...r.props} />,
      text: gameRecapText(r.props),
    })),
  })
  return {sent: result.sent, failed: result.failed, error: result.errors[0] ?? null}
}
