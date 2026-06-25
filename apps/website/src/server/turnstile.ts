import type {ZodIssue} from 'zod'

// Cloudflare Turnstile server-side verification. The client widget only produces a
// token; it MUST be verified server-side, otherwise a bot can skip the widget and
// POST a forged/blank token directly. Shared by the /contact and /request-cards forms.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000

export type TurnstileResult = {ok: true} | {ok: false; reason: 'missing-token' | 'failed'}

/**
 * Verify a Turnstile token against Cloudflare. Returns `{ok: true}` when the token
 * is valid. `remoteip` (the visitor's IP, e.g. `Astro.clientAddress`) is optional
 * but recommended by Cloudflare for stronger fraud signals. The request is bounded
 * by a 5s timeout so a slow/unresponsive Cloudflare can't hang the SSR worker.
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteip?: string
): Promise<TurnstileResult> {
  if (!token) return {ok: false, reason: 'missing-token'}

  const body = new URLSearchParams({secret, response: token})
  if (remoteip) body.set('remoteip', remoteip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    const data = (await res.json()) as {success: boolean}
    return data.success ? {ok: true} : {ok: false, reason: 'failed'}
  } catch {
    // Network error or timeout — treat as a failed (retryable) check, not a crash.
    return {ok: false, reason: 'failed'}
  }
}

/** Shape a Turnstile failure into the form's `errors` record (keyed like a ZodIssue). */
export const turnstileError = (message: string): Record<string, ZodIssue> => ({
  'cf-turnstile-response': {code: 'custom', message, path: ['cf-turnstile-response']} as ZodIssue,
})

/** Standard user-facing copy for the two Turnstile failure modes. */
export const turnstileErrorFor = (reason: 'missing-token' | 'failed') =>
  turnstileError(
    reason === 'missing-token'
      ? 'Please complete the security check.'
      : 'Security check failed. Please try again.'
  )
