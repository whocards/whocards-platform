import {describe, expect, it} from 'vitest'

import {readTestEmailEnv} from './env'

const validEnv = {
  ANDROID_TESTER_SIGNUP_URL: 'https://example.com/signup',
  EMAIL_TEST_RECIPIENT: 'tester@example.com',
  EMAIL_TEST_SEND_CONFIRMED: 'true',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'WhoCards <hello@whocards.cc>',
}

describe('readTestEmailEnv', () => {
  it('requires an explicit test-send confirmation', () => {
    expect(() => readTestEmailEnv({...validEnv, EMAIL_TEST_SEND_CONFIRMED: 'false'})).toThrow()
  })

  it('accepts one valid test recipient', () => {
    expect(readTestEmailEnv(validEnv).EMAIL_TEST_RECIPIENT).toBe('tester@example.com')
  })

  it('rejects a recipient list', () => {
    expect(() =>
      readTestEmailEnv({...validEnv, EMAIL_TEST_RECIPIENT: 'one@example.com,two@example.com'})
    ).toThrow()
  })
})
