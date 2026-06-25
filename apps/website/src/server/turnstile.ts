// Cloudflare Turnstile server-side verification. The client widget only produces a
// token; it MUST be verified server-side, otherwise a bot can skip the widget and
// POST a forged/blank token directly. Shared by the /contact and /request-cards forms.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult =
  | {ok: true}
  | {ok: false; reason: 'missing-token' | 'failed'}

/**
 * Verify a Turnstile token against Cloudflare. Returns `{ok: true}` when the token
 * is valid. Callers pass the configured secret; when it's unset the route should
 * decide whether to skip verification (dev) rather than calling this.
 */
export async function verifyTurnstile(token: string, secret: string): Promise<TurnstileResult> {
  if (!token) return {ok: false, reason: 'missing-token'}

  const body = new URLSearchParams({secret, response: token})
  const res = await fetch(VERIFY_URL, {method: 'POST', body})
  const data = (await res.json()) as {success: boolean}

  return data.success ? {ok: true} : {ok: false, reason: 'failed'}
}
