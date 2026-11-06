import {sign} from 'node:crypto'

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

export const signJwt = (
  alg: 'ES256' | 'RS256',
  header: Record<string, string>,
  payload: Record<string, string | number>,
  privateKey: string
): string => {
  const input = `${base64url({alg, typ: 'JWT', ...header})}.${base64url(payload)}`
  const signature = sign('sha256', Buffer.from(input), {
    key: privateKey,
    // JWS wants ES256 as raw r||s, not Node's default DER.
    ...(alg === 'ES256' && {dsaEncoding: 'ieee-p1363' as const}),
  })
  return `${input}.${signature.toString('base64url')}`
}
