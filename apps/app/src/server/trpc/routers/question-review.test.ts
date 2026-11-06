import {PGlite} from '@electric-sql/pglite'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, describe, expect, it, vi} from 'vitest'

import * as schema from '~/server/db/schema'
import type {TRPCContext} from '../context'
import {createCallerFactory} from '../trpc'

const client = new PGlite()
const db = drizzle(client, {schema})
vi.mock('../../db', () => ({db}))

const {questionReviewRouter} = await import('./question-review')

const reviewer: TRPCContext = {
  user: {id: 'u-rev', email: 'rev@example.com', name: 'Rev'},
  membership: {organizationId: 'org', role: 'reviewer'},
}
const caller = createCallerFactory(questionReviewRouter)(reviewer)
const deckSlug = 'ai-at-work'
const questionId = 'ai-1'

beforeAll(async () => {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  for (const statement of statements) await client.exec(statement)
  await db.insert(schema.appUser).values({id: 'u-rev', name: 'Rev', email: 'rev@example.com'})
  await db.insert(schema.deck).values({slug: deckSlug, title: 'AI Check-In'})
  await db.insert(schema.deckQuestion).values({deckSlug, questionId, actLabel: 'Act 1'})
}, 60_000)

describe('question review comments', () => {
  it('serves every variant of a Question and keeps each comment on its own variant', async () => {
    const [question] = await caller.variants({deckSlug})
    const slugs = Object.keys(question?.variants ?? {})
    expect(slugs.length).toBeGreaterThan(1)

    for (const variant of slugs) {
      await caller.comments.add({deckSlug, questionId, variant, body: `on ${variant}`})
    }
    await caller.comments.add({deckSlug, questionId, body: 'on the Question'})

    const comments = await caller.comments.list({deckSlug, questionId})
    expect(comments.map(({variant, body}) => ({variant, body}))).toEqual([
      ...slugs.map((variant) => ({variant, body: `on ${variant}`})),
      {variant: null, body: 'on the Question'},
    ])
  })

  it('refuses a variant slug longer than 64 characters', async () => {
    await expect(
      caller.comments.add({deckSlug, questionId, variant: 'v'.repeat(65), body: 'too long'})
    ).rejects.toThrow('Too big')
  })
})
