// Tests for the Slack request-signature verifier (issue #179 spike, see
// docs/strategy/surface-chat.md §9). No network calls, no DB — pure function.

import {createHmac} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {verifySlackSignature} from './verify'

const TEST_SECRET = 'test-signing-secret-0123456789'

/** Sign a payload the way Slack does, for a deterministic fixed timestamp. */
function sign(body: string, timestamp: string, secret = TEST_SECRET): string {
  const baseString = `v0:${timestamp}:${body}`
  return `v0=${createHmac('sha256', secret).update(baseString).digest('hex')}`
}

// A fixed "now" so tests are deterministic regardless of when they run.
const FIXED_NOW_MS = 1_800_000_000_000
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW_MS / 1000)
const fixedNow = () => FIXED_NOW_MS

describe('verifySlackSignature', () => {
  it('accepts a correctly-signed, fresh request', () => {
    const body = 'command=%2Fwhocards&text=ai-at-work'
    const timestamp = String(FIXED_NOW_SECONDS)
    const signature = sign(body, timestamp)

    expect(
      verifySlackSignature({signingSecret: TEST_SECRET, timestamp, body, signature, now: fixedNow})
    ).toBe(true)
  })

  it('rejects a tampered body', () => {
    const timestamp = String(FIXED_NOW_SECONDS)
    const signature = sign('command=%2Fwhocards&text=ai-at-work', timestamp)

    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp,
        body: 'command=%2Fwhocards&text=library', // different from what was signed
        signature,
        now: fixedNow,
      })
    ).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const body = 'command=%2Fwhocards'
    const timestamp = String(FIXED_NOW_SECONDS)

    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp,
        body,
        signature: 'v0=' + '0'.repeat(64),
        now: fixedNow,
      })
    ).toBe(false)
  })

  it('rejects a signature produced with the wrong secret', () => {
    const body = 'command=%2Fwhocards'
    const timestamp = String(FIXED_NOW_SECONDS)
    const signature = sign(body, timestamp, 'a-completely-different-secret')

    expect(
      verifySlackSignature({signingSecret: TEST_SECRET, timestamp, body, signature, now: fixedNow})
    ).toBe(false)
  })

  it('rejects a stale timestamp (replay protection), even with a valid signature', () => {
    const body = 'command=%2Fwhocards'
    const staleTimestamp = String(FIXED_NOW_SECONDS - 60 * 10) // 10 minutes old
    const signature = sign(body, staleTimestamp)

    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp: staleTimestamp,
        body,
        signature,
        now: fixedNow,
      })
    ).toBe(false)
  })

  it('rejects a timestamp from the future beyond the allowed skew', () => {
    const body = 'command=%2Fwhocards'
    const futureTimestamp = String(FIXED_NOW_SECONDS + 60 * 10)
    const signature = sign(body, futureTimestamp)

    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp: futureTimestamp,
        body,
        signature,
        now: fixedNow,
      })
    ).toBe(false)
  })

  it('accepts a custom maxAgeSeconds window', () => {
    const body = 'command=%2Fwhocards'
    const timestamp = String(FIXED_NOW_SECONDS - 60 * 8) // 8 minutes old
    const signature = sign(body, timestamp)

    // Default 5-minute window rejects it...
    expect(
      verifySlackSignature({signingSecret: TEST_SECRET, timestamp, body, signature, now: fixedNow})
    ).toBe(false)

    // ...but a wider window accepts it.
    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp,
        body,
        signature,
        now: fixedNow,
        maxAgeSeconds: 60 * 15,
      })
    ).toBe(true)
  })

  it('rejects a non-numeric timestamp', () => {
    const body = 'command=%2Fwhocards'
    const signature = sign(body, 'not-a-number')

    expect(
      verifySlackSignature({
        signingSecret: TEST_SECRET,
        timestamp: 'not-a-number',
        body,
        signature,
        now: fixedNow,
      })
    ).toBe(false)
  })
})
