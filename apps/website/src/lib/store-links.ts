const isIos = (userAgent: string): boolean => /iphone|ipad|ipod/i.test(userAgent)

/**
 * On iOS, points every `a[data-ios-href]` at the App Store URL it carries and
 * shows it if hidden; each such link then reports `app_store_clicked` with its `data-source`.
 */
export function wireIosStoreLinks(): void {
  if (!isIos(navigator.userAgent)) return
  document.querySelectorAll<HTMLAnchorElement>('a[data-ios-href]').forEach((link) => {
    link.href = link.dataset.iosHref ?? link.href
    link.hidden = false
    link.addEventListener('click', () => {
      window.posthog?.capture('app_store_clicked', {store: 'ios', source: link.dataset.source})
    })
  })
}
