import {describe, expect, it} from 'vitest'
import {
  isValidNewsletterConfirmToken,
  newsletterConfirmToken,
  newsletterConfirmUrl,
} from './newsletter-token'

const secret = 'whsec_test'

describe('newsletter confirm token (#360)', () => {
  it('accepts the token minted for the same email, case-insensitively', () => {
    const token = newsletterConfirmToken('Ann@Example.com', secret)
    expect(isValidNewsletterConfirmToken('ann@example.com', token, secret)).toBe(true)
  })

  it('rejects a token for another email, another secret or a forged value', () => {
    const token = newsletterConfirmToken('ann@example.com', secret)
    expect(isValidNewsletterConfirmToken('bob@example.com', token, secret)).toBe(false)
    expect(isValidNewsletterConfirmToken('ann@example.com', token, 'whsec_other')).toBe(false)
    expect(isValidNewsletterConfirmToken('ann@example.com', '', secret)).toBe(false)
  })

  it('builds a confirm link carrying the email and its token', () => {
    const url = new URL(newsletterConfirmUrl('https://whocards.cc', 'Ann@Example.com', secret))
    expect(url.pathname).toBe('/newsletter/confirm')
    expect(url.searchParams.get('email')).toBe('ann@example.com')
    const token = url.searchParams.get('token') ?? ''
    expect(isValidNewsletterConfirmToken('ann@example.com', token, secret)).toBe(true)
  })
})

describe('translator confirm link (#391)', () => {
  it('carries its type and a token that only the translator type accepts', () => {
    const url = new URL(
      newsletterConfirmUrl('https://whocards.cc', 'ann@example.com', secret, 'translator')
    )
    expect(url.searchParams.get('type')).toBe('translator')
    const token = url.searchParams.get('token') ?? ''
    expect(isValidNewsletterConfirmToken('ann@example.com', token, secret, 'translator')).toBe(true)
    expect(isValidNewsletterConfirmToken('ann@example.com', token, secret)).toBe(false)
  })
})
