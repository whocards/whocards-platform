import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

import {PGlite} from '@electric-sql/pglite'
import {applyPatch, parsePatch} from 'diff'
import {eq} from 'drizzle-orm'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import * as schema from '~/server/db/schema'
import * as websiteSchema from '../../../../../website/src/server/db/schema'
import type {SourceQuestion} from '../../agent/anthropic'
import type {AppRole} from '../../auth/permissions'
import {createCallerFactory} from '../trpc'

const client = new PGlite()
const db = drizzle(client, {schema: {...schema, ...websiteSchema}})
vi.mock('../../db', () => ({db}))
vi.mock('@whocards/env/app', () => ({env: {OWNER_EMAIL: 'owner@example.com'}}))

const {createTranslationRouter} = await import('./translation')

const translate = vi.fn<
  (language: string, questions: SourceQuestion[]) => Promise<Map<string, string>>
>(async (language, questions) => new Map(questions.map((q) => [q.id, `[${language}] ${q.source}`])))
const sendLogin = vi.fn<(email: string) => Promise<void>>(async () => {})

const callerAs = (role: AppRole, userId = `u-${role}`, withAi = true, organizationId = 'org') =>
  createCallerFactory(createTranslationRouter({translate: withAi ? translate : null, sendLogin}))({
    user: {id: userId, email: `${userId}@example.com`, name: userId},
    membership: {organizationId, role},
  })

const repoRoot = new URL('../../../../../../', import.meta.url)
const admin = callerAs('admin')

const signUp = async (email: string, confirmed = true) => {
  const [row] = await db
    .insert(websiteSchema.emailConsent)
    .values({
      email,
      consentType: 'translator',
      consentSource: 'test',
      language: 'id',
      confirmedAt: confirmed ? new Date().toISOString() : null,
    })
    .returning()
  if (!row) throw new Error('no row')
  return row
}

const translatorFor = async (email: string) => {
  const [member] = await db
    .select({userId: schema.appMember.userId, organizationId: schema.appMember.organizationId})
    .from(schema.appMember)
    .innerJoin(schema.appUser, eq(schema.appMember.userId, schema.appUser.id))
    .where(eq(schema.appUser.email, email))
  if (!member) throw new Error(`no member ${email}`)
  return callerAs('translator', member.userId, true, member.organizationId)
}

beforeAll(async () => {
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({...schema, ...websiteSchema})
  )
  for (const statement of statements) await client.exec(statement)
  await db.insert(schema.appUser).values({id: 'u-admin', name: 'Admin', email: 'u-admin@x.com'})
}, 60_000)

beforeEach(() => {
  translate.mockClear()
  sendLogin.mockClear()
})

describe('translator sign-ups', () => {
  it('lists only confirmed, pending sign-ups, and never calls the AI to do it', async () => {
    await signUp('pending@example.com')
    await signUp('unconfirmed@example.com', false)

    const signups = await admin.signups()
    expect(signups.map((s) => s.email)).toEqual(['pending@example.com'])
    expect(translate).not.toHaveBeenCalled()
  })

  it('only an admin sees or approves them', async () => {
    await expect(callerAs('facilitator').signups()).rejects.toThrow('Requires admin')
    await expect(callerAs('translator').approveSignup({id: 1, language: 'id'})).rejects.toThrow(
      'Requires admin'
    )
    expect(translate).not.toHaveBeenCalled()
  })
})

describe('approving a sign-up', () => {
  it('runs the AI pass, invites a translator for that language and sends the login', async () => {
    const signup = await signUp('ana@example.com')
    const result = await admin.approveSignup({id: signup.id, language: 'id'})

    expect(result.aiPass).toBe('ran')
    expect(result.drafted).toBeGreaterThan(0)
    expect(translate.mock.calls.every(([language]) => language === 'id')).toBe(true)
    expect(sendLogin).toHaveBeenCalledWith('ana@example.com')

    const [member] = await db
      .select({role: schema.appMember.role, language: schema.appMember.language})
      .from(schema.appMember)
      .innerJoin(schema.appUser, eq(schema.appMember.userId, schema.appUser.id))
      .where(eq(schema.appUser.email, 'ana@example.com'))
    expect(member).toEqual({role: 'translator', language: 'id'})
    expect((await admin.signups()).some((s) => s.email === 'ana@example.com')).toBe(false)
  })

  it('runs one pass per deck per language: a second translator for it gets no new call', async () => {
    const signup = await signUp('budi@example.com')
    const result = await admin.approveSignup({id: signup.id, language: 'id'})
    expect(result).toEqual({aiPass: 'ran', drafted: 0})
    expect(translate).not.toHaveBeenCalled()
  })

  it('still invites and sends the login without an API key, and says the pass was skipped', async () => {
    const signup = await signUp('citra@example.com')
    const noAi = callerAs('admin', 'u-admin', false)
    expect(await noAi.approveSignup({id: signup.id, language: 'sw'})).toEqual({
      aiPass: 'skipped',
      drafted: null,
    })
    expect(sendLogin).toHaveBeenCalledWith('citra@example.com')
    expect((await (await translatorFor('citra@example.com')).workspace({})).language).toBe('sw')
  })
})

describe('the translator', () => {
  it('sees only its own language and can never start an AI call', async () => {
    const translator = await translatorFor('ana@example.com')
    const workspace = await translator.workspace({language: 'de'})

    expect(workspace.language).toBe('id')
    expect(workspace.languages).toEqual([])
    expect(workspace.decks.length).toBeGreaterThan(0)
    expect(workspace.decks[0]?.questions[0]?.text).toMatch(/^\[id\] /)
    expect(translate).not.toHaveBeenCalled()
  })

  it('edits and approves drafts into a diff that applies cleanly to packages/decks', async () => {
    const translator = await translatorFor('ana@example.com')
    const {decks} = await translator.workspace({})
    const picks = decks.map((deck) => ({deckSlug: deck.slug, question: deck.questions[0]!}))

    for (const {deckSlug, question} of picks) {
      await translator.save({
        deckSlug,
        questionId: question.id,
        text: `Edited ${question.id}`,
        status: 'approved',
      })
    }

    const {patch} = await translator.workspace({})
    execFileSync('git', ['apply', '--check', '-'], {cwd: repoRoot, input: patch})

    const library = picks.find((p) => p.deckSlug === 'library')!
    const pool = readFileSync(new URL('packages/decks/src/pool/questions.json', repoRoot), 'utf8')
    const libraryPatch = parsePatch(patch).find((p) =>
      p.newFileName?.endsWith('pool/questions.json')
    )
    const applied = libraryPatch && applyPatch(pool, libraryPatch)
    if (!applied) throw new Error('patch did not apply')
    expect(JSON.parse(applied)[library.question.id].id).toBe(`Edited ${library.question.id}`)
    expect(translate).not.toHaveBeenCalled()
  })

  it('cannot save into a Question that is not up for translation', async () => {
    const translator = await translatorFor('ana@example.com')
    await expect(
      translator.save({deckSlug: 'library', questionId: 'nope', text: 'x', status: 'draft'})
    ).rejects.toThrow('Nothing to translate')
  })

  it('is closed to every role below admin but translator', async () => {
    await expect(callerAs('reviewer').workspace({})).rejects.toThrow('translators and admins')
  })
})
