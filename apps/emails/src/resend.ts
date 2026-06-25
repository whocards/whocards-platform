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
