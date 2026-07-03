/**
 * Pure rule for flagging Netlify preview/branch builds as internal traffic
 * (issue #178), kept free of any `env` import so it's unit-testable without
 * the full server environment — mirrors constants/app-visibility.ts's pattern.
 *
 * Netlify sets `CONTEXT` on every build to one of `'production'` |
 * `'deploy-preview'` | `'branch-deploy'` | `'dev'`
 * (https://docs.netlify.com/configure-builds/environment-variables/#build-metadata).
 * Anything other than `'production'` is internal/preview traffic — a real
 * player never lands on a deploy-preview or branch-deploy URL. `undefined`
 * (a non-Netlify build, e.g. a bare `astro build` off CI) is treated as
 * internal too, the safe-by-default direction — though it's moot for the one
 * caller (PostHog.astro): local `astro dev` already skips `posthog.init()`
 * entirely via `import.meta.env.DEV`, so this only ever actually matters for
 * real Netlify builds.
 */
export const isInternalDeployContext = (context: string | undefined): boolean =>
  context !== 'production'
