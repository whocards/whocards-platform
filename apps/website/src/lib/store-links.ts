type Device = Pick<Navigator, 'userAgent' | 'maxTouchPoints'>

// iPadOS Safari defaults to a Mac user agent; touch support is what gives it away.
export const isIos = ({userAgent, maxTouchPoints}: Device): boolean =>
  /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)

/**
 * On iOS, points every `a[data-ios-href]` at the App Store URL it carries and
 * shows it if hidden; each such link then reports `app_store_clicked` with its `data-source`.
 */
export function wireIosStoreLinks(): void {
  if (!isIos(navigator)) return
  document.querySelectorAll<HTMLAnchorElement>('a[data-ios-href]').forEach((link) => {
    link.href = link.dataset.iosHref ?? link.href
    link.hidden = false
    link.addEventListener('click', () => {
      window.posthog?.capture('app_store_clicked', {store: 'ios', source: link.dataset.source})
    })
  })
}
