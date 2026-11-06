// expo-router parses deep-link queries with query-string 7, which decodes via the patched decode-uri-component 0.2.2.
import path from 'node:path'

const queryString: {parse: (query: string) => Record<string, string>} = require(
  require.resolve('query-string', {
    paths: [path.dirname(require.resolve('expo-router/package.json'))],
  })
)

describe('deep-link query decoding', () => {
  it('decodes valid and malformed percent-encoding', () => {
    expect(queryString.parse('a=%C2%B5&b=hello+world')).toEqual({a: 'µ', b: 'hello world'})
    expect(queryString.parse('a=%E0%A4%A%E0%A4%AD&b=%C2%B5%&c=%FE%FF')).toEqual({
      a: '%E0%A4%Aभ',
      b: 'µ%',
      c: '��',
    })
  })

  it('decodes a long malformed run quickly (GHSA-qr28-fpjm-wq7f, GHSA-vcc3-ghjq-m6fr)', () => {
    const start = Date.now()
    queryString.parse(`a=${'%C2'.repeat(500)}`)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
