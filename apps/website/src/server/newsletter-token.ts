import {createHmac, timingSafeEqual} from 'node:crypto'
import {normalizeEmail} from './consent'
import type {ConfirmableConsentType} from './consent'

// Double opt-in link token (#360): an HMAC of the consent type and email, so no token column is stored.
// shortcut: tokens never expire; add a timestamp to the signed payload if old links become a problem.
const sign = (email: string, secret: string, consentType: ConfirmableConsentType = 'newsletter') =>
  createHmac('sha256', secret)
    .update(`${consentType}-confirm:${normalizeEmail(email)}`)
    .digest('base64url')

export const newsletterConfirmToken = sign

export const isValidNewsletterConfirmToken = (
  email: string,
  token: string,
  secret: string,
  consentType: ConfirmableConsentType = 'newsletter'
) => {
  const expected = Buffer.from(sign(email, secret, consentType))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export const newsletterConfirmUrl = (
  origin: string,
  email: string,
  secret: string,
  consentType: ConfirmableConsentType = 'newsletter'
) => {
  const url = new URL('/newsletter/confirm', origin)
  url.searchParams.set('email', normalizeEmail(email))
  url.searchParams.set('token', sign(email, secret, consentType))
  if (consentType !== 'newsletter') url.searchParams.set('type', consentType)
  return url.toString()
}
