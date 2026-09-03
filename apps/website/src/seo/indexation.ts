import languages from '../data/languages.json'

const languageRedirects = new Set(Object.keys(languages).map((language) => `/${language}`))

/**
 * Routes that are useful to visitors but are not evergreen search landing pages.
 * Keep this policy shared by page metadata and the sitemap so the two signals
 * cannot disagree.
 */
export function isNoindexRoute(pathname: string): boolean {
  // `build.format: 'file'` exposes prerendered routes to Astro layouts with
  // their emitted `.html` suffix, while sitemap URLs use clean paths.
  const route = pathname.endsWith('.html') ? pathname.slice(0, -'.html'.length) : pathname

  return (
    route === '/404' ||
    route === '/android-testers' ||
    route === '/android-testers-birthday-present' ||
    route.endsWith('/images') ||
    route === '/events/hajnalig/play' ||
    /^\/events\/hajnalig\/[^/]+\/play$/.test(route) ||
    route === '/dev' ||
    route.startsWith('/dev/')
  )
}

/** Filters absolute sitemap URLs through the same noindex policy used by page layouts. */
export function shouldIncludeInSitemap(page: string): boolean {
  const {pathname} = new URL(page)
  return !isNoindexRoute(pathname) && !languageRedirects.has(pathname)
}
