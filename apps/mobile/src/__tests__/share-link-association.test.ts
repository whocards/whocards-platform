/**
 * Share links must keep opening the app (#428): every URL `buildShareUrl` emits,
 * share UTM included, has to stay inside the Universal Links / App Links
 * association the website serves, and the app must still read the question from it.
 */
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {DEFAULT_DECK_SLUG} from '@whocards/decks'

import appJson from '../../app.json'
import {redirectSystemPath} from '../app/+native-intent'
import {buildShareUrl} from '../lib/share-url'

jest.mock('@/env', () => ({env: {EXPO_PUBLIC_WEB_URL: 'https://whocards.cc'}}))

const wellKnown = path.join(__dirname, '../../../website/public/.well-known')

type Aasa = {applinks: {details: {appIDs: string[]; components: {'/': string}[]}[]}}
type AssetLinks = {target: {package_name: string}}[]

const aasa: Aasa = JSON.parse(
  readFileSync(path.join(wellKnown, 'apple-app-site-association'), 'utf8')
)
const assetLinks: AssetLinks = JSON.parse(
  readFileSync(path.join(wellKnown, 'assetlinks.json'), 'utf8')
)

// AASA path patterns: `*` matches any run of characters, `?` exactly one.
const aasaPattern = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`
  )

const matchesAasa = (pathname: string) =>
  aasa.applinks.details.some(
    (detail) =>
      detail.appIDs.some((id) => id.endsWith(`.${appJson.expo.ios.bundleIdentifier}`)) &&
      detail.components.some((component) => aasaPattern(component['/']).test(pathname))
  )

const androidFilters = appJson.expo.android.intentFilters.flatMap((filter) => filter.data)

const matchesAppLinks = (url: URL) =>
  assetLinks.some((link) => link.target.package_name === appJson.expo.android.package) &&
  androidFilters.some(
    (data) =>
      `${data.scheme}:` === url.protocol &&
      data.host === url.hostname &&
      ('path' in data ? url.pathname === data.path : url.pathname.startsWith(data.pathPrefix))
  )

// expo-router parses deep-link queries with its own query-string copy.
const queryString: {parse: (query: string) => Record<string, string>} = require(
  require.resolve('query-string', {
    paths: [path.dirname(require.resolve('expo-router/package.json'))],
  })
)

describe.each([DEFAULT_DECK_SLUG, 'ai-at-work', 'hajnalig'])('share link for %s', (deck) => {
  const url = new URL(buildShareUrl(deck, 'es', '42'))

  it('carries the share UTM', () => {
    expect(url.searchParams.get('utm_source')).toBe('share')
  })

  it('stays inside the Universal Links association', () => {
    expect(appJson.expo.ios.associatedDomains).toContain(`applinks:${url.hostname}`)
    expect(matchesAasa(url.pathname)).toBe(true)
  })

  it('stays inside the App Links association', () => {
    expect(matchesAppLinks(url)).toBe(true)
  })

  it('still opens the question in the app', () => {
    const routed = new URL(redirectSystemPath({path: url.toString(), initial: true}), url.origin)
    expect(routed.pathname).toBe(`/play/${deck}`)
    expect(queryString.parse(routed.search)).toMatchObject({lang: 'es', q: '42'})
  })
})
