import {z} from 'zod'
import type {ZodIssue} from 'zod'

// Cloudflare Turnstile server-side verification. The client widget only produces a
// token; it MUST be verified server-side, otherwise a bot can skip the widget and
// POST a forged/blank token directly. Shared by every protected surface: /contact,
// /request-cards, the /app waitlist and the /ai-at-work lead magnet.
//
// Beyond `success`, the handler also pins the token to the surface it was minted
// for (`action`, set via `data-action` on the widget) and to the hostname the page
// was served from, so a token harvested on one page or domain can't be replayed
// against another. Cloudflare's always-pass testing keys (used in CI and local dev)
// return no action and a placeholder hostname, so those two checks are skipped when
// Cloudflare flags the result as coming from a testing key — that flag can only
// appear when *our own* secret is a testing secret, never from a forged token.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000
// Cloudflare caps tokens at 2048 characters; anything longer is not a real token.
const MAX_TOKEN_LENGTH = 2048

/** Stable per-surface action names. Must match the widget's `data-action`. */
export const TURNSTILE_ACTION = {
  contact: 'contact',
  requestCards: 'request-cards',
  appWaitlist: 'app-waitlist',
  aiCheckin: 'ai-checkin',
} as const

export type TurnstileAction = (typeof TURNSTILE_ACTION)[keyof typeof TURNSTILE_ACTION]

export type TurnstileFailure = 'missing-token' | 'failed'
export type TurnstileResult = {ok: true} | {ok: false; reason: TurnstileFailure}

export type TurnstileExpectation = Readonly<{
  /** The `data-action` the widget was rendered with. */
  action: TurnstileAction
  /** Hostname the form page was served from, e.g. `Astro.url.hostname`. */
  hostname: string
  /** Visitor IP (e.g. `Astro.clientAddress`) — optional, improves fraud signals. */
  remoteip?: string
}>

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  metadata: z.object({result_with_testing_key: z.boolean().optional()}).optional(),
})

/**
 * Verify a Turnstile token against Cloudflare. Returns `{ok: true}` only when the
 * token is valid AND was minted for the expected action on the expected hostname.
 * The request is bounded by a 5s timeout so a slow/unresponsive Cloudflare can't
 * hang the SSR worker; any network/shape error is a failed (retryable) check.
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  expected: TurnstileExpectation
): Promise<TurnstileResult> {
  if (!token) return {ok: false, reason: 'missing-token'}
  if (token.length > MAX_TOKEN_LENGTH || !expected.hostname) return {ok: false, reason: 'failed'}

  const body = new URLSearchParams({secret, response: token})
  if (expected.remoteip) body.set('remoteip', expected.remoteip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    if (!res.ok) return {ok: false, reason: 'failed'}
    const data = siteverifyResponseSchema.parse(await res.json())
    if (!data.success) return {ok: false, reason: 'failed'}

    if (data.metadata?.result_with_testing_key) return {ok: true}

    const bound = data.action === expected.action && data.hostname === expected.hostname
    return bound ? {ok: true} : {ok: false, reason: 'failed'}
  } catch {
    // Network error or timeout — treat as a failed (retryable) check, not a crash.
    return {ok: false, reason: 'failed'}
  }
}

/** Shape a Turnstile failure into the form's `errors` record (keyed like a ZodIssue). */
export const turnstileError = (message: string): Record<string, ZodIssue> => ({
  'cf-turnstile-response': {code: 'custom', message, path: ['cf-turnstile-response']},
})

/** Standard user-facing copy for the two Turnstile failure modes. */
export const turnstileMessageFor = (reason: TurnstileFailure) =>
  reason === 'missing-token'
    ? 'Please complete the security check.'
    : 'Security check failed. Please try again.'

export const turnstileErrorFor = (reason: TurnstileFailure) =>
  turnstileError(turnstileMessageFor(reason))
