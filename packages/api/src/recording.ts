/**
 * Shared policy: should a client actually record (send) Answer events?
 *
 * Recording feeds the shared Global progress (CONTEXT.md → Answer record), so a
 * production build always records. In development it is suppressed so local play
 * does not pollute the real Answer record — unless the host opts in. Each host
 * passes its own `dev` flag and `optIn` because the platforms detect them
 * differently:
 *   - web:    `import.meta.env.DEV` + `PUBLIC_RECORD_ANSWERS`
 *   - mobile: `__DEV__` + `EXPO_PUBLIC_RECORD_ANSWERS`
 *
 * Lives in its own module (exported as `@whocards/api/recording`) so clients can
 * import the policy without pulling the tRPC server router into their bundle.
 */
export const shouldRecordAnswers = ({dev, optIn}: {dev: boolean; optIn: boolean}): boolean =>
  !dev || optIn
