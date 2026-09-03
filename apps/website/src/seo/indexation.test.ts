import {describe, expect, it} from 'vitest'
import {isNoindexRoute, shouldIncludeInSitemap} from './indexation'

const site = 'https://whocards.cc'

describe('search indexation policy', () => {
  it.each([
    '/404',
    '/android-testers',
    '/android-testers-birthday-present',
    '/images',
    '/hu/images',
    '/dev/image-playground',
    '/events/hajnalig/play',
    '/events/hajnalig/2025/play',
  ])('keeps noindexed route %s out of the sitemap', (pathname) => {
    expect(isNoindexRoute(pathname)).toBe(true)
    expect(shouldIncludeInSitemap(`${site}${pathname}`)).toBe(false)
  })

  it.each([
    '/',
    '/ai-at-work',
    '/app',
    '/contact',
    '/mission',
    '/print',
    '/request-cards',
    '/legal/pp',
    '/play',
    '/events/hajnalig',
    '/events/hajnalig/2025',
    '/en/question/42',
  ])('keeps evergreen route %s indexable and in the sitemap', (pathname) => {
    expect(isNoindexRoute(pathname)).toBe(false)
    expect(shouldIncludeInSitemap(`${site}${pathname}`)).toBe(true)
  })

  it('keeps distinct /play/[deck] landing pages indexable and in the sitemap', () => {
    const deckPath = '/play/couples'
    expect(isNoindexRoute(deckPath)).toBe(false)
    expect(shouldIncludeInSitemap(`${site}${deckPath}`)).toBe(true)
  })

  it.each(['/en', '/hu'])('omits language-only redirect %s from the sitemap', (pathname) => {
    expect(isNoindexRoute(pathname)).toBe(false)
    expect(shouldIncludeInSitemap(`${site}${pathname}`)).toBe(false)
  })
})
