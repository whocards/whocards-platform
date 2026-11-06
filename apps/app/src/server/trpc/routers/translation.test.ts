import {execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {PGlite} from '@electric-sql/pglite'
import {getDeck} from '@whocards/decks'
import {applyPatch, parsePatch} from 'diff'
import {eq} from 'drizzle-orm'
import {generateDrizzleJson, generateMigration} from 'drizzle-kit/api'
import {drizzle} from 'drizzle-orm/pglite'
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import * as schema from '~/server/db/schema'
import * as websiteSchema from '../../../../../website/src/server/db/schema'
import type {AppRole} from '../../auth/permissions'
import {createCallerFactory} from '../trpc'
import type {TranslationDeps} from './translation'

const client = new PGlite()
const db = drizzle(client, {schema: {...schema, ...websiteSchema}})
vi.mock('../../db', () => ({db}))
vi.mock('@whocards/env/app', () => ({env: {OWNER_EMAIL: 'owner@example.com'}}))

const {createTranslationRouter} = await import('./translation')
const {translationPatch} = await import('./translation-logic')
const {addMember} = await import('./people')

type Translate = NonNullable<TranslationDeps['translate']>
const translate = vi.fn<Translate>(
  async (language, questions) => new Map(questions.map((q) => [q.id, `[${language}] ${q.source}`]))
)
const sendLogin = vi.fn<(email: string) => Promise<void>>(async () => {})

const callerAs = (
  role: AppRole,
  userId = `u-${role}`,
  deps: Partial<TranslationDeps> = {},
  organizationId = 'org'
) =>
  createCallerFactory(createTranslationRouter({translate, sendLogin, ...deps}))({
    user: {id: userId, email: `${userId}@example.com`, name: userId},
    membership: {organizationId, role},
  })

const repoRoot = new URL('../../../../../../', import.meta.url)
const admin = callerAs('admin')

const questionCount = (language: string) =>
  ['library', 'hajnalig', 'ai-at-work']
    .map((slug) => getDeck(slug)!)
    .filter((deck) => !deck.languages.includes(language))
    .reduce((n, deck) => n + deck.questionIds.length, 0)

const all = (slug: string, language: string) =>
  getDeck(slug)!.questionIds.map((questionId) => ({
    deckSlug: slug,
    questionId,
    text: `[${language}] ${questionId}`,
  }))

// Applies the patch to a throwaway copy of packages/decks and runs that package's own tests.
const decksTestsPass = (patch: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'decks-patch-'))
  try {
    const decks = fileURLToPath(new URL('packages/decks', repoRoot))
    cpSync(decks, join(dir, 'packages/decks'), {
      recursive: true,
      filter: (src) => !src.includes('node_modules'),
    })
    symlinkSync(join(decks, 'node_modules'), join(dir, 'packages/decks/node_modules'))
    execFileSync('git', ['apply', '-'], {cwd: dir, input: patch})
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))
    )
    execFileSync(process.execPath, [join(decks, 'node_modules/vitest/vitest.mjs'), 'run'], {
      cwd: join(dir, 'packages/decks'),
      env,
      stdio: 'pipe',
    })
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
}

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

const memberFor = async (email: string) =>
  (
    await db
      .select({
        userId: schema.appMember.userId,
        organizationId: schema.appMember.organizationId,
        role: schema.appMember.role,
        language: schema.appMember.language,
      })
      .from(schema.appMember)
      .innerJoin(schema.appUser, eq(schema.appMember.userId, schema.appUser.id))
      .where(eq(schema.appUser.email, email))
  )[0]

const translatorFor = async (email: string) => {
  const member = await memberFor(email)
  if (!member) throw new Error(`no member ${email}`)
  return callerAs('translator', member.userId, {}, member.organizationId)
}

const draftsIn = (language: string) =>
  db.select().from(schema.translationDraft).where(eq(schema.translationDraft.language, language))

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

    expect(result).toEqual({aiPass: 'ran', drafted: questionCount('id'), needsDrafting: 0})
    expect(translate.mock.calls.every(([language]) => language === 'id')).toBe(true)
    expect(sendLogin).toHaveBeenCalledWith('ana@example.com')
    expect(await memberFor('ana@example.com')).toMatchObject({role: 'translator', language: 'id'})
    expect((await admin.signups()).some((s) => s.email === 'ana@example.com')).toBe(false)
  })

  it('drafts each Question once per language: a second translator gets no new call', async () => {
    await admin.approveSignup({id: (await signUp('budi@example.com')).id, language: 'it'})
    translate.mockClear()

    const result = await admin.approveSignup({
      id: (await signUp('bayu@example.com')).id,
      language: 'it',
    })
    expect(result).toEqual({aiPass: 'ran', drafted: questionCount('it'), needsDrafting: 0})
    expect(translate).not.toHaveBeenCalled()
  })

  it('keeps the chunks that finished when one fails, still invites, and redrafts only the gap', async () => {
    translate.mockRejectedValueOnce(new Error('Anthropic API error (429)'))
    const first = await admin.approveSignup({
      id: (await signUp('dewi@example.com')).id,
      language: 'ko',
    })

    expect(first).toEqual({aiPass: 'ran', drafted: questionCount('ko') - 20, needsDrafting: 20})
    expect(await draftsIn('ko')).toHaveLength(questionCount('ko') - 20)
    expect(await memberFor('dewi@example.com')).toMatchObject({role: 'translator', language: 'ko'})
    expect(sendLogin).toHaveBeenCalledWith('dewi@example.com')
    expect((await admin.signups()).some((s) => s.email === 'dewi@example.com')).toBe(false)

    translate.mockClear()
    const second = await admin.approveSignup({
      id: (await signUp('eka@example.com')).id,
      language: 'ko',
    })
    expect(second).toMatchObject({needsDrafting: 0})
    expect(translate).toHaveBeenCalledOnce()
    expect(translate.mock.calls[0]?.[1]).toHaveLength(20)
  })

  it('stops the AI pass at the deadline and keeps what finished', async () => {
    const slow = vi.fn<Translate>(
      (_language, _questions, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    )
    slow.mockImplementationOnce(translate)
    const result = await callerAs('admin', 'u-admin', {
      translate: slow,
      aiDeadlineMs: 50,
    }).approveSignup({id: (await signUp('fajar@example.com')).id, language: 'sv'})

    expect(result).toEqual({aiPass: 'ran', drafted: 20, needsDrafting: questionCount('sv') - 20})
    expect(await memberFor('fajar@example.com')).toMatchObject({role: 'translator'})
    expect(sendLogin).toHaveBeenCalledWith('fajar@example.com')
  })

  it('caps AI text at 2000 characters, like a translator save', async () => {
    const long = vi.fn<Translate>(
      async (_l, questions) => new Map(questions.map((q) => [q.id, 'x'.repeat(3000)]))
    )
    await callerAs('admin', 'u-admin', {translate: long}).approveSignup({
      id: (await signUp('gita@example.com')).id,
      language: 'fi',
    })
    const drafts = await draftsIn('fi')
    expect(drafts.length).toBeGreaterThan(0)
    expect(drafts.every((d) => d.text.length === 2000)).toBe(true)
  })

  it('lets only one of two concurrent approvals through, with one AI pass', async () => {
    const signup = await signUp('hadi@example.com')
    const results = await Promise.allSettled([
      admin.approveSignup({id: signup.id, language: 'nl'}),
      admin.approveSignup({id: signup.id, language: 'nl'}),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const [rejected] = results.filter((r) => r.status === 'rejected')
    expect(['CONFLICT', 'NOT_FOUND']).toContain(rejected?.reason.code)
    const calls = translate.mock.calls.flatMap(([, questions]) => questions)
    expect(calls).toHaveLength(questionCount('nl'))
    expect(sendLogin).toHaveBeenCalledOnce()
  })

  it('backs off when someone invites them to the team while the AI pass runs', async () => {
    const signup = await signUp('indah@example.com')
    const racing = vi.fn<Translate>(async (language, questions, signal) => {
      await addMember({email: 'indah@example.com', role: 'reviewer'})
      return translate(language, questions, signal)
    })
    await expect(
      callerAs('admin', 'u-admin', {translate: racing}).approveSignup({
        id: signup.id,
        language: 'cs',
      })
    ).rejects.toThrow('already on the team as reviewer')
    expect(await memberFor('indah@example.com')).toMatchObject({role: 'reviewer', language: null})
    expect(sendLogin).not.toHaveBeenCalled()
    expect((await admin.signups()).some((s) => s.id === signup.id)).toBe(true)
  })

  it('refuses to make the seeded owner a translator', async () => {
    const signup = await signUp('Owner@example.com')
    await expect(admin.approveSignup({id: signup.id, language: 'id'})).rejects.toThrow(
      'seeded owner'
    )
    expect(translate).not.toHaveBeenCalled()
    expect((await admin.signups()).some((s) => s.id === signup.id)).toBe(true)
  })

  it('still invites and sends the login without an API key, and says the pass was skipped', async () => {
    const signup = await signUp('citra@example.com')
    const noAi = callerAs('admin', 'u-admin', {translate: null})
    expect(await noAi.approveSignup({id: signup.id, language: 'sw'})).toEqual({aiPass: 'skipped'})
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
    expect(patch).not.toContain('languages')
    decksTestsPass(patch)

    const library = picks.find((p) => p.deckSlug === 'library')!
    const pool = readFileSync(new URL('packages/decks/src/pool/questions.json', repoRoot), 'utf8')
    const libraryPatch = parsePatch(patch).find((p) =>
      p.newFileName?.endsWith('pool/questions.json')
    )
    const applied = libraryPatch && applyPatch(pool, libraryPatch)
    if (!applied) throw new Error('patch did not apply')
    expect(JSON.parse(applied)[library.question.id].id).toBe(`Edited ${library.question.id}`)
    expect(translate).not.toHaveBeenCalled()
  }, 60_000)

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

describe('the deck diff', () => {
  it('skips a Question that already ships the language', () => {
    expect(translationPatch('de', [{deckSlug: 'library', questionId: '1', text: 'x'}])).toBe('')
  })

  it("adds the language to a complete inline deck's list when the Pool ships it", () => {
    const patch = translationPatch('de', all('hajnalig', 'de'))
    expect(patch).toContain("+  languages: ['hu', 'en', 'de'] as string[],")
    decksTestsPass(patch)
  }, 60_000)

  it("leaves a complete inline deck's list alone while the Pool lacks the language", () => {
    const patch = translationPatch('id', all('ai-at-work', 'id'))
    expect(patch).toContain('ai-at-work.questions.json')
    expect(patch).not.toContain('languages')
    decksTestsPass(patch)
  }, 60_000)

  it('adds the language to languages.json once every Pool Question has it', () => {
    const patch = translationPatch('id', [...all('library', 'id'), ...all('ai-at-work', 'id')])
    expect(patch).toContain('+  "id": "Indonesian"')
    expect(patch).toContain("+  languages: ['en', 'id'],")
    decksTestsPass(patch)
  }, 60_000)
})
