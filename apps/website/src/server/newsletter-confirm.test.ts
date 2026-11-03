import {eq} from 'drizzle-orm'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import * as schema from './db/schema'
import {resetTestDb} from './db/test-helpers'
import type {TestDb} from './db/test-helpers'
import {upsertConsent} from './db/upsert'
import {newsletterConfirm} from './newsletter-confirm'
import {newsletterConfirmToken} from './newsletter-token'

const secret = 'whsec_test'
const email = 'ann@example.com'
const token = newsletterConfirmToken(email, secret)

let db: TestDb
beforeEach(async () => {
  db = await resetTestDb()
})

const pending = () =>
  upsertConsent(db, {email, consentType: 'newsletter', consentSource: 'footer', confirmed: false})

const run = (post: boolean, onConfirmed = vi.fn<() => Promise<void>>(async () => {})) =>
  newsletterConfirm(db, {post, email, token, secret, onConfirmed})

describe('newsletter confirm page (#360)', () => {
  it('a GET (link scanner) only asks; the POST from its button confirms and syncs once', async () => {
    await pending()
    const onConfirmed = vi.fn<() => Promise<void>>(async () => {})

    expect(await run(false, onConfirmed)).toBe('ask')
    const [row] = await db.select().from(schema.emailConsent)
    expect(row.confirmedAt).toBeNull()
    expect(onConfirmed).not.toHaveBeenCalled()

    expect(await run(true, onConfirmed)).toBe('subscribed')
    expect(await run(true, onConfirmed)).toBe('subscribed')
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('says not subscribed when there is no active newsletter row', async () => {
    expect(await run(true)).toBe('not-subscribed')
    const row = await pending()
    await db
      .update(schema.emailConsent)
      .set({unsubscribedAt: '2025-01-01T00:00:00Z'})
      .where(eq(schema.emailConsent.id, row.id))
    expect(await run(true)).toBe('not-subscribed')
  })

  it('rejects a forged token', async () => {
    await pending()
    expect(
      await newsletterConfirm(db, {
        post: true,
        email,
        token: 'x',
        secret,
        onConfirmed: vi.fn<() => Promise<void>>(),
      })
    ).toBe('invalid')
  })
})
