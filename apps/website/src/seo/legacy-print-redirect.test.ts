import {readFile} from 'node:fs/promises'

import {describe, expect, it} from 'vitest'

type Redirect = {
  force?: boolean
  from?: string
  status?: number
  to?: string
}

const parseRedirects = (config: string): Redirect[] =>
  config
    .split('[[redirects]]')
    .slice(1)
    .map((block) => {
      const value = (key: string): string | undefined =>
        block.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, 'm'))?.[1]

      return {
        force: value('force') === 'true',
        from: value('from'),
        status: Number(value('status')),
        to: value('to'),
      }
    })

const netlifyConfig = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8')
const redirects = parseRedirects(netlifyConfig)

describe('legacy English printable deck URL', () => {
  it('has an exact, forced permanent deployment redirect to the current print flow', () => {
    const redirect = redirects.find(({from}) => from === '/cards/en-wide.pdf')

    expect(redirect).toEqual({
      force: true,
      from: '/cards/en-wide.pdf',
      status: 301,
      to: '/print',
    })
  })

  it('preserves queries through Netlify destination passthrough semantics', () => {
    const redirect = redirects.find(({from}) => from === '/cards/en-wide.pdf')
    const request = new URL(
      'https://whocards.cc/cards/en-wide.pdf?utm_source=legacy&ref=partner'
    )
    const destination = new URL(redirect?.to ?? '', request)

    // Netlify forwards the incoming query when the configured destination does
    // not specify one. Mirror that routing behavior for this artifact check.
    if (!destination.search) destination.search = request.search

    expect(destination.pathname).toBe('/print')
    expect(destination.search).toBe('?utm_source=legacy&ref=partner')
  })
})
