import {betterAuth} from 'better-auth'
import {memoryAdapter} from 'better-auth/adapters/memory'
import {magicLink} from 'better-auth/plugins'
import {describe, expect, it} from 'vitest'

import {MAGIC_LINK_DISABLE_SIGNUP} from './magic-link-policy'

describe('MAGIC_LINK_DISABLE_SIGNUP', () => {
  it('is invite-only: no anonymous magic-link sign-up', () => {
    expect(MAGIC_LINK_DISABLE_SIGNUP).toBe(true)
  })
})

type FakeUserRow = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
}

/** A throwaway better-auth instance backed by its own in-memory adapter — no
 *  mocks, no network, no dependency on our db/env. Returns typed references
 *  to the users/sessions arrays directly (rather than reading them back out
 *  through MemoryDB's `{[key: string]: any[]}` index signature) so
 *  assertions don't fight noUncheckedIndexedAccess. */
const buildAuth = () => {
  const sentLinks: Record<string, string> = {}
  const users: FakeUserRow[] = []
  const sessions: unknown[] = []
  const auth = betterAuth({
    database: memoryAdapter({user: users, session: sessions, account: [], verification: []}),
    secret: 'vitest-only-secret-never-used-for-anything-real',
    baseURL: 'http://localhost:3100',
    emailAndPassword: {enabled: false},
    plugins: [
      magicLink({
        disableSignUp: MAGIC_LINK_DISABLE_SIGNUP,
        sendMagicLink: async ({email, url}) => {
          sentLinks[email] = url
        },
      }),
    ],
  })
  return {auth, users, sessions, sentLinks, headers: new Headers()}
}

type MagicLinkAuth = ReturnType<typeof buildAuth>['auth']

const requestToken = async (
  auth: MagicLinkAuth,
  sentLinks: Record<string, string>,
  headers: Headers,
  email: string
): Promise<string> => {
  await auth.api.signInMagicLink({body: {email}, headers})
  const url = sentLinks[email]
  if (!url) throw new Error(`no magic link was sent for ${email}`)
  const token = new URL(url).searchParams.get('token')
  if (!token) throw new Error(`magic link for ${email} had no token: ${url}`)
  return token
}

/**
 * From-scratch proof (real better-auth code + its own in-memory adapter) of
 * the exact mechanism auth.tsx's MAGIC_LINK_DISABLE_SIGNUP relies on: the
 * magic-link `verify` handler only consults `disableSignUp` in the branch
 * where `findUserByEmail` finds nothing. This is what makes it safe to close
 * sign-up without locking out anyone who already has a user row (the seeded
 * OWNER_EMAIL, or anyone people.ts's invite pre-provisioned).
 */
describe('better-auth magic-link disableSignUp mechanism (invite-only)', () => {
  it('lets a pre-existing user (the seeded owner, or an invited member) sign in', async () => {
    const {auth, users, sentLinks, headers} = buildAuth()
    users.push({
      id: 'owner-1',
      email: 'avicharlop@gmail.com',
      name: 'Avi',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const token = await requestToken(auth, sentLinks, headers, 'avicharlop@gmail.com')
    const result = await auth.api.magicLinkVerify({query: {token}, headers, asResponse: false})

    expect(result?.user?.email).toBe('avicharlop@gmail.com')
    expect(users).toHaveLength(1) // no duplicate row created
  })

  it('blocks a brand-new email from self-signing-up', async () => {
    const {auth, users, sessions, sentLinks, headers} = buildAuth()

    const token = await requestToken(auth, sentLinks, headers, 'rando@example.com')

    await expect(
      auth.api.magicLinkVerify({query: {token}, headers, asResponse: false})
    ).rejects.toMatchObject({statusCode: 302})
    expect(users).toHaveLength(0)
    expect(sessions).toHaveLength(0)
  })
})
