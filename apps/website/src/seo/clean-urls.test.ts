import {describe, expect, it} from 'vitest'

import {
  assertCleanSitemap,
  cleanUrlRedirect,
  normalizeSitemapRoot,
  withCleanUrlRedirects,
} from '../../scripts/seo-postbuild.mjs'
import {isCleanSitemapPage} from './sitemap'

describe('clean public URLs', () => {
  it('keeps clean routes in the sitemap and rejects build artifact aliases', () => {
    expect(isCleanSitemapPage('https://whocards.cc/')).toBe(true)
    expect(isCleanSitemapPage('https://whocards.cc/mission')).toBe(true)
    expect(isCleanSitemapPage('https://whocards.cc/index.html')).toBe(false)
    expect(isCleanSitemapPage('https://whocards.cc/mission.html')).toBe(false)
  })

  it('creates forced permanent redirects for root and nested .html aliases', () => {
    expect(cleanUrlRedirect('index.html')).toBe('/index.html / 301!')
    expect(cleanUrlRedirect('mission.html')).toBe('/mission.html /mission 301!')
    expect(cleanUrlRedirect('events/hajnalig.html')).toBe(
      '/events/hajnalig.html /events/hajnalig 301!'
    )
  })

  it('replaces its generated redirect block when run again', () => {
    const existingConfig = '/preorder /contact 301\n'
    const redirects = ['/index.html / 301!', '/mission.html /mission 301!']
    const once = withCleanUrlRedirects(existingConfig, redirects)
    const twice = withCleanUrlRedirects(once, redirects)

    expect(twice).toBe(once)
    expect(twice.match(/BEGIN GENERATED CLEAN URL ALIASES/g)).toHaveLength(1)
  })

  it('requires the clean root URL and rejects .html sitemap entries', () => {
    expect(normalizeSitemapRoot('<loc>https://whocards.cc</loc>')).toBe(
      '<loc>https://whocards.cc/</loc>'
    )
    expect(() =>
      assertCleanSitemap('<urlset><url><loc>https://whocards.cc/</loc></url></urlset>')
    ).not.toThrow()
    expect(() =>
      assertCleanSitemap('<urlset><url><loc>https://whocards.cc/index.html</loc></url></urlset>')
    ).toThrow('Sitemap does not contain a clean root URL')
    expect(() =>
      assertCleanSitemap(
        '<urlset><url><loc>https://whocards.cc/</loc></url><url><loc>https://whocards.cc/mission.html</loc></url></urlset>'
      )
    ).toThrow('Sitemap contains build artifact URL')
  })
})
