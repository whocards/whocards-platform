import type {ReactElement} from 'react'
import {Resend} from 'resend'

export type SendEmailInput = Readonly<{
  apiKey: string
  from: string
  html: ReactElement
  subject: string
  text: string
  to: string
  replyTo?: string
}>

/** Send one transactional email. Callers own env validation and recipient selection. */
export async function sendEmail({apiKey, from, html, subject, text, to, replyTo}: SendEmailInput) {
  const resend = new Resend(apiKey)
  return resend.emails.send({from, react: html, subject, text, to: [to], replyTo})
}

export type BatchEmail = Readonly<{
  html: ReactElement
  subject: string
  text: string
  to: string
}>

export type SendEmailBatchResult = Readonly<{sent: number; failed: number; errors: string[]}>

const BATCH_LIMIT = 100

/** Send many emails through Resend's batch API, 100 per request. A failed request counts its whole chunk as failed. */
export async function sendEmailBatch({
  apiKey,
  from,
  emails,
  replyTo,
}: Readonly<{
  apiKey: string
  from: string
  emails: readonly BatchEmail[]
  replyTo?: string
}>): Promise<SendEmailBatchResult> {
  const resend = new Resend(apiKey)
  let sent = 0
  let failed = 0
  const errors: string[] = []
  for (let i = 0; i < emails.length; i += BATCH_LIMIT) {
    const chunk = emails.slice(i, i + BATCH_LIMIT)
    const {error} = await resend.batch.send(
      chunk.map((e) => ({
        from,
        react: e.html,
        subject: e.subject,
        text: e.text,
        to: [e.to],
        replyTo,
      }))
    )
    if (error) {
      failed += chunk.length
      errors.push(error.message)
    } else {
      sent += chunk.length
    }
  }
  return {sent, failed, errors}
}
