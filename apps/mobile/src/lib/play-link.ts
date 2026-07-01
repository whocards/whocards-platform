import {DEFAULT_DECK_SLUG} from '@whocards/decks'

/** A parsed play deep link: the target deck plus any `?q=`/`?lang=` intent. */
export type PlayLink = {deck: string; q?: string; lang?: string}

/**
 * Parse an incoming play deep link into its target deck + query, or `null` for any
 * link that isn't a play link.
 *
 * Handles both Universal/App Links (`https://whocards.cc/play/…`) and the custom
 * scheme (`mobile://play/…`, whose first segment lands in `host`, not `pathname`).
 * A slug-less `/play` maps to the default deck — mirroring `+native-intent`'s
 * `redirectSystemPath`, which rewrites that path for the router. This parser exists
 * for the warm-deep-link listener in `play/[deck]`, where expo-router de-dupes a
 * same-route link and never updates the route params, so the raw URL is the only
 * signal that a new question was requested.
 */
export function parsePlayLink(path: string): PlayLink | null {
  try {
    const url = new URL(path, 'https://whocards.cc')
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    const pathname = isHttp ? url.pathname : `/${url.host}${url.pathname}`
    const q = url.searchParams.get('q') ?? undefined
    const lang = url.searchParams.get('lang') ?? undefined
    if (pathname === '/play' || pathname === '/play/') {
      return {deck: DEFAULT_DECK_SLUG, q, lang}
    }
    const match = pathname.match(/^\/play\/([^/]+)\/?$/)
    if (match) return {deck: decodeURIComponent(match[1]), q, lang}
    return null
  } catch {
    // Malformed link — not actionable.
    return null
  }
}
