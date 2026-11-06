import {betterAuth} from 'better-auth'
import {memoryAdapter} from 'better-auth/adapters/memory'
import {magicLink, organization} from 'better-auth/plugins'
import {describe, expect, it} from 'vitest'

import {translatorsOffOrganizationEndpoints} from './organization-policy'
import {roles} from './permissions'

const baseURL = 'http://localhost:3100'
const now = new Date()
const db = {
  user: [
    {
      id: 'u-admin',
      email: 'admin@x.com',
      name: 'A',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {id: 'u-tr', email: 'tr@x.com', name: 'T', emailVerified: true, createdAt: now, updatedAt: now},
  ],
  session: [],
  account: [],
  verification: [],
  organization: [{id: 'org', name: 'WhoCards', slug: 'whocards', createdAt: now}],
  member: [
    {id: 'm1', organizationId: 'org', userId: 'u-admin', role: 'admin', createdAt: now},
    {id: 'm2', organizationId: 'org', userId: 'u-tr', role: 'translator', createdAt: now},
  ],
  invitation: [],
}
const links: Record<string, string> = {}
const auth = betterAuth({
  baseURL,
  secret: 'vitest-only-secret-never-used-for-anything-real',
  database: memoryAdapter(db),
  emailAndPassword: {enabled: false},
  hooks: {before: translatorsOffOrganizationEndpoints},
  plugins: [
    magicLink({
      sendMagicLink: async ({email, url}) => {
        links[email] = url
      },
    }),
    organization({roles, allowUserToCreateOrganization: false}),
  ],
})

const cookieFor = async (email: string) => {
  await auth.api.signInMagicLink({body: {email}, headers: new Headers()})
  const token = new URL(links[email]!).searchParams.get('token')!
  const {headers} = await auth.api.magicLinkVerify({
    query: {token},
    headers: new Headers(),
    returnHeaders: true,
  })
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

const get = async (email: string, path: string) =>
  (
    await auth.handler(
      new Request(`${baseURL}/api/auth${path}`, {headers: {cookie: await cookieFor(email)}})
    )
  ).status

describe('organization endpoints', () => {
  for (const path of [
    '/organization/list-members?organizationSlug=whocards',
    '/organization/get-full-organization?organizationSlug=whocards',
  ]) {
    it(`refuse a translator but not an admin: ${path}`, async () => {
      expect(await get('tr@x.com', path)).toBe(403)
      expect(await get('admin@x.com', path)).toBe(200)
    })
  }
})
