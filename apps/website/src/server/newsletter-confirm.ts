import {and, eq, isNull} from 'drizzle-orm'
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core'
import {normalizeEmail} from './consent'
import {confirmNewsletterConsent} from './db/upsert'
import * as schema from './db/schema'
import {isValidNewsletterConfirmToken} from './newsletter-token'

export type NewsletterConfirmState = 'invalid' | 'ask' | 'subscribed' | 'not-subscribed'

// Only a POST confirms: mail link scanners follow GET links without a human click (#360).
export const newsletterConfirm = async <T extends PgQueryResultHKT>(
  database: PgDatabase<T, typeof schema>,
  opts: {
    post: boolean
    email: string
    token: string
    secret: string
    onConfirmed: (email: string) => Promise<void>
  }
): Promise<NewsletterConfirmState> => {
  const email = normalizeEmail(opts.email)
  if (email === '' || !isValidNewsletterConfirmToken(email, opts.token, opts.secret))
    return 'invalid'

  const {emailConsent} = schema
  const [row] = await database
    .select({confirmedAt: emailConsent.confirmedAt})
    .from(emailConsent)
    .where(
      and(
        eq(emailConsent.email, email),
        eq(emailConsent.consentType, 'newsletter'),
        isNull(emailConsent.unsubscribedAt)
      )
    )
  if (!row) return 'not-subscribed'
  if (row.confirmedAt) return 'subscribed'
  if (!opts.post) return 'ask'
  if ((await confirmNewsletterConsent(database, email)) === 0)
    // An unsubscribe or another confirm landed since the read above: report the row as it is now.
    return newsletterConfirm(database, {...opts, post: false})
  await opts.onConfirmed(email)
  return 'subscribed'
}
