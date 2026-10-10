const CONTENT_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

/** Cache-Control for a tRPC response; null leaves the host default. */
export const cacheControlFor = (o: {
  paths: readonly string[] | undefined
  type: string
  errorCount: number
}): string | null => {
  // Game state is per player and changes by the second; a cached copy would show a stale turn.
  if (o.paths?.some((path) => path.startsWith('game.'))) return 'no-store'
  // Read-only content queries are edge-cacheable (ADR-0002); never errors or mutations.
  return o.errorCount === 0 && o.type === 'query' ? CONTENT_CACHE : null
}
