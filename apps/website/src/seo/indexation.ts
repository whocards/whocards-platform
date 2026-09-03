import languages from '../data/languages.json'

const languageRedirects = new Set(Object.keys(languages).map((language) => `/${language}`))

/**
 * Routes that are useful to visitors but are not evergreen search landing pages.
 * Keep this policy shared by page metadata and the sitemap so the two signals
 * cannot disagree.
 */
export function isNoindexRoute(pathname: string): boolean {
  return (
    pathname === '/404' ||
    pathname === '/android-testers' ||
    pathname === '/android-testers-birthday-present' ||
    pathname.endsWith('/images') ||
    pathname === '/events/hajnalig/play' ||
    /^\/events\/hajnalig\/[^/]+\/play$/.test(pathname) ||
    pathname === '/dev' ||
    pathname.startsWith('/dev/')
  )
}

/** Filters absolute sitemap URLs through the same noindex policy used by page layouts. */
export function shouldIncludeInSitemap(page: string): boolean {
  const {pathname} = new URL(page)
  return !isNoindexRoute(pathname) && !languageRedirects.has(pathname)
}
