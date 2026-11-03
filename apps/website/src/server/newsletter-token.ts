import {createHmac, timingSafeEqual} from 'node:crypto'
import {normalizeEmail} from './consent'

// Double opt-in link token (#360): an HMAC of the email, so no token column is stored.
// shortcut: tokens never expire; add a timestamp to the signed payload if old links become a problem.
const sign = (email: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`newsletter-confirm:${normalizeEmail(email)}`)
    .digest('base64url')

export const newsletterConfirmToken = sign

export const isValidNewsletterConfirmToken = (email: string, token: string, secret: string) => {
  const expected = Buffer.from(sign(email, secret))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const newsletterConfirmUrl = (origin: string, email: string, secret: string) => {
  const url = new URL('/newsletter/confirm', origin)
  url.searchParams.set('email', normalizeEmail(email))
  url.searchParams.set('token', sign(email, secret))
  return url.toString()
}
