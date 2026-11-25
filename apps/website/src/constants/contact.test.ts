import {describe, expect, it} from 'vitest'

import {contactMessageSchema} from '~utils/schemas'
import {contactAboutFrom, contactPlatformFrom, contactVersionFrom} from './contact'

const message = {name: 'Ada', email: 'ada@example.com', message: 'The app is lovely.'}

describe('contact About (issue #455)', () => {
  it('reads a known ?about= value and falls back to General for anything else', () => {
    expect(contactAboutFrom('android-test')).toBe('android-test')
    expect(contactAboutFrom('<script>')).toBe('general')
    expect(contactAboutFrom(null)).toBe('general')
    expect(contactAboutFrom('toString')).toBe('general')
  })

  it('keeps only a known platform and an x.y.z version', () => {
    expect(contactPlatformFrom('ios')).toBe('ios')
    expect(contactPlatformFrom('windows')).toBeUndefined()
    expect(contactVersionFrom('1.2.0')).toBe('1.2.0')
    expect(contactVersionFrom('1.2.0"><b>')).toBeUndefined()
  })

  it('parses a submission, defaulting About to General', () => {
    expect(contactMessageSchema.parse(message)).toMatchObject({about: 'general'})
    expect(
      contactMessageSchema.parse({
        ...message,
        about: 'app-feedback',
        platform: 'android',
        version: '1.2.0',
      })
    ).toMatchObject({about: 'app-feedback', platform: 'android', version: '1.2.0'})
    expect(
      contactMessageSchema.parse({...message, about: 'nope', platform: 'x', version: 'y'})
    ).toMatchObject({about: 'general', platform: undefined, version: undefined})
  })
})
