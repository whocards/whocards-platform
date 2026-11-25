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
  about,
  platform,
  version,
}: SendContactMessageInput) {
  const props = {name, email, message, about, platform, version}
  return sendEmail({
    apiKey,
    from,
    to,
    replyTo: email,
    subject: contactMessageSubject(name, about),
    html: createElement(ContactMessageEmail, props),
    text: contactMessageText(props),
  })
}
