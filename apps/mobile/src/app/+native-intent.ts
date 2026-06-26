import {DEFAULT_DECK_SLUG} from '@whocards/decks'

/**
 * Normalises incoming deep links (Universal Links / App Links and the `mobile://`
 * scheme) before expo-router resolves them to a route.
 *
 * The website serves the default deck at `/play` with no slug segment (see
 * `buildShareUrl`), but in-app every deck lives under the `play/[deck]` route. A
 * universal link to `https://whocards.cc/play?q=…` therefore has no `[deck]` to
 * bind. Rewrite the slug-less path to the default deck so the link resolves; the
 * `?q=`/`?lang=` query is preserved untouched. All other paths pass through.
 */
export function redirectSystemPath({path}: {path: string; initial: boolean}): string {
  try {
    // `path` may be a full URL (https/scheme) or a bare path — the base only
    // applies to the latter, so both parse correctly.
    const url = new URL(path, 'https://whocards.cc')
    if (url.pathname === '/play') {
      return `/play/${DEFAULT_DECK_SLUG}${url.search}`
    }
  } catch {
    // Malformed link — hand the original path back and let the router decide.
  }
  return path
}
