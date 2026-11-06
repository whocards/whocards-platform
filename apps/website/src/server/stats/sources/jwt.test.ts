import {generateKeyPairSync, verify} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {signJwt} from './jwt'

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())

describe('signJwt', () => {
  it('signs ES256 as raw r||s that crypto.verify accepts', () => {
    const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'})
    const pem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString()
    const token = signJwt('ES256', {kid: 'kid'}, {iss: 'iss'}, pem)
    const [header = '', payload = '', signature = ''] = token.split('.')
    expect(decode(header)).toEqual({alg: 'ES256', typ: 'JWT', kid: 'kid'})
    expect(decode(payload)).toEqual({iss: 'iss'})
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64)
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        {key: publicKey, dsaEncoding: 'ieee-p1363'},
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true)
  })

  it('signs RS256 that crypto.verify accepts', () => {
    const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048})
    const pem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString()
    const token = signJwt('RS256', {}, {iss: 'svc'}, pem)
    const [header = '', payload = '', signature = ''] = token.split('.')
    expect(decode(header)).toEqual({alg: 'RS256', typ: 'JWT'})
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true)
  })
})
