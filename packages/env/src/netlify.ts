type NetlifyEnv = Readonly<Record<string, string | undefined>>

/** On Netlify, production's primary URL or the deploy's own permalink; `fallback` elsewhere. */
export function netlifySiteUrl(env: NetlifyEnv, fallback: string): string | undefined {
  if (!env.NETLIFY) return fallback
  return (env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL) || undefined
}
