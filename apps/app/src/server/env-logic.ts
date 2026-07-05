// Pure logic split out of env.ts so it's testable without constructing the
// real env (which requires DB_URL/BETTER_AUTH_SECRET/RESEND_API_KEY to be set)
// — same split as decks-logic.ts / question-review-logic.ts.

/**
 * In production, BETTER_AUTH_URL must be explicitly set. Silently falling
 * back to `http://localhost:3100` (the dev-convenience default) would mean a
 * deploy that forgot to set it doesn't fail to boot — magic-link emails would
 * just silently embed the wrong origin instead. Dev/test keep the localhost
 * default; only production is required to be explicit, matching
 * BETTER_AUTH_SECRET/RESEND_API_KEY's fail-closed behavior.
 */
export const requiresExplicitBetterAuthUrl = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'production'
