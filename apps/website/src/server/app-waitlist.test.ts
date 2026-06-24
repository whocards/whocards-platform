import {describe, expect, it} from 'vitest'
import {
  appWaitlistSchema,
  confirmationEmail,
  confirmationMessage,
  resolveConsent,
} from './app-waitlist'

describe('app waitlist consent (#87)', () => {
  describe('schema', () => {
    it('defaults newsletter to false when omitted — consent is never assumed', () => {
      const parsed = appWaitlistSchema.parse({email: 'a@b.com', source: 'app-waitlist'})
      expect(parsed.newsletter).toBe(false)
    })

    it('accepts an explicit newsletter opt-in', () => {
      const parsed = appWaitlistSchema.parse({email: 'a@b.com', newsletter: true})
      expect(parsed.newsletter).toBe(true)
    })

    it('rejects an invalid email before any side effect', () => {
      expect(appWaitlistSchema.safeParse({email: 'nope'}).success).toBe(false)
    })
  })

  describe('resolveConsent — the two consents are stored separately', () => {
    it('a waitlist-only signup grants app-notification consent but NOT newsletter', () => {
      expect(resolveConsent({newsletter: false})).toEqual({appWaitlist: true, newsletter: false})
    })

    it('opting in grants both consents', () => {
      expect(resolveConsent({newsletter: true})).toEqual({appWaitlist: true, newsletter: true})
    })

    it('a missing newsletter field is treated as no newsletter consent', () => {
      expect(resolveConsent({})).toEqual({appWaitlist: true, newsletter: false})
    })
  })

  describe('confirmation copy reflects the selected consent', () => {
    it('an app-only subscriber is not promised newsletter content', () => {
      const message = confirmationMessage({newsletter: false})
      const {html} = confirmationEmail({newsletter: false})
      expect(message).toContain('Nothing else')
      expect(html).toContain('no newsletter')
      expect(html).not.toContain('opted in')
    })

    it('an opted-in subscriber is told they will get occasional emails', () => {
      const message = confirmationMessage({newsletter: true})
      const {html} = confirmationEmail({newsletter: true})
      expect(message).toContain('occasional')
      expect(html).toContain('opted in')
    })
  })
})
