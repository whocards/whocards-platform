// Where this process is building, read from Netlify's build variables. Pure so it can
// be unit-tested; callers feed it process.env.

export type NetlifyEnv = Readonly<Record<string, string | undefined>>

/** True in any Netlify build context: production, deploy-preview, branch-deploy. */
export function isNetlify(env: NetlifyEnv): boolean {
  return !!env.NETLIFY
}

/** The deploy's own origin on Netlify (primary URL in production, the deploy's
    permalink elsewhere); `fallback` everywhere else. */
export function netlifySiteUrl(env: NetlifyEnv, fallback: string): string | undefined {
  if (!isNetlify(env)) return fallback
  return (env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL) || undefined
}
