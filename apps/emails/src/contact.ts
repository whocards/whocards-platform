import {createElement} from 'react'

import {sendEmail} from './resend'
import type {ContactMessageProps} from './templates/contact-message'
import {
  ContactMessageEmail,
  contactMessageSubject,
  contactMessageText,
} from './templates/contact-message'

export type SendContactMessageInput = ContactMessageProps &
  Readonly<{
    apiKey: string
    from: string
    /** Inbox the contact form delivers to (e.g. hello@whocards.cc). */
    to: string
  }>

/**
 * Render and send a contact-form submission as a transactional email. Replies go
 * to the submitter. Callers own env validation (apiKey/from/to) and rate limiting.
 */
export async function sendContactMessage({
  apiKey,
  from,
  to,
  name,
  email,
  message,
}: SendContactMessageInput) {
  return sendEmail({
    apiKey,
    from,
    to,
    replyTo: email,
    subject: contactMessageSubject(name),
    html: createElement(ContactMessageEmail, {name, email, message}),
    text: contactMessageText({name, email, message}),
  })
}
