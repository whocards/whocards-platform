/**
 * Invite-only sign-up. better-auth's magic-link `verify` handler only
 * consults `disableSignUp` in the branch where `findUserByEmail` finds
 * nothing — an email with an existing `app_user` row (the seeded
 * `OWNER_EMAIL`, see auth/bootstrap.ts's `ensureMembership`, or anyone
 * `people.ts`'s `invite` has already pre-provisioned) sails through to a
 * session regardless of this flag. Flipping it to `true` only closes the
 * door on brand-new emails self-serving an unprivileged account — see
 * magic-link-policy.test.ts for a from-scratch proof of that exact mechanism
 * against better-auth's own code (not a mock).
 *
 * Kept as its own tiny dependency-free constant (rather than an inline
 * literal in auth.tsx) so the policy is regression-tested without pulling in
 * auth.tsx's db/env dependency chain — same pure/impure split as
 * decks-logic.ts, question-review-logic.ts, and env-logic.ts.
 */
export const MAGIC_LINK_DISABLE_SIGNUP = true
