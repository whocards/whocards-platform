// Slack request-signature verification (issue #179 spike — see
// docs/strategy/surface-chat.md §9). Pure, dependency-free (no @slack/bolt or
// similar) — Slack's signing scheme is simple enough to hand-roll directly
// against Node's crypto, the same call spike 0002 made for every platform: "a
// hand-rolled adapter per platform is genuinely less code than pulling in even
// a thin library." Mirrors the shape of `verifyResendSignature` in
// `../resend-webhook.ts`, which DOES take a dependency (`svix`) — but only
// because Svix, not Resend, owns that signing format; Slack's is a single
// documented HMAC construction with no third-party protocol to interop with.
//
// Algorithm (https://api.slack.com/authentication/verifying-requests-from-slack):
//   base_string = "v0:{timestamp}:{raw_body}"
//   expected    = "v0=" + hex(hmac_sha256(signing_secret, base_string))
//   compare expected to the request's X-Slack-Signature header (constant-time)
// Slack also recommends rejecting requests whose timestamp is more than five
// minutes old or from the future, to block replay of a captured request.

import {createHmac, timingSafeEqual} from 'node:crypto'

const DEFAULT_MAX_AGE_SECONDS = 60 * 5

export function verifySlackSignature({
  signingSecret,
  timestamp,
  body,
  signature,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  now = () => Date.now(),
}: {
  signingSecret: string
  timestamp: string
  body: string
  signature: string
  /** Reject requests older (or newer, e.g. clock skew) than this many seconds. */
  maxAgeSeconds?: number
  /** Injectable clock for tests. Defaults to the real time. */
  now?: () => number
}): boolean {
  const requestTime = Number(timestamp)
  if (!Number.isFinite(requestTime)) return false
  if (Math.abs(now() / 1000 - requestTime) > maxAgeSeconds) return false

  const baseString = `v0:${timestamp}:${body}`
  const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`

  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  // timingSafeEqual throws on mismatched lengths rather than returning false.
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}
