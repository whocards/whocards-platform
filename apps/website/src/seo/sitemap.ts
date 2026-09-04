export const isCleanSitemapPage = (page: string): boolean => {
  const {pathname} = new URL(page)
  return !pathname.endsWith('.html')
}
