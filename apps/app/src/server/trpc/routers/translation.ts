import {and, eq, isNotNull, isNull} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {SourceQuestion} from '../../agent/anthropic'
import {roleAtLeast} from '../../auth/permissions'
import {db} from '../../db'
import {appMember, appUser, translationDraft} from '../../db/schema'
import type {TRPCContext} from '../context'
import {createTRPCRouter, roleProcedure} from '../trpc'
import {addMember} from './people'
import {chunk, LANGUAGE_PATTERN, translationPatch, untranslatedDecks} from './translation-logic'
// Website and app share one Postgres; the website owns this table.
import {emailConsent} from '../../../../../website/src/server/db/schema'

export type TranslationDeps = {
  /** null when ANTHROPIC_API_KEY is unset: approval still invites, the AI pass is skipped. */
  translate:
    | ((language: string, questions: SourceQuestion[]) => Promise<Map<string, string>>)
    | null
  sendLogin: (email: string) => Promise<void>
}

// Small enough that each call, run in parallel, finishes inside Netlify's 60s function limit.
const QUESTIONS_PER_CALL = 20

const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LANGUAGE_PATTERN, 'Use a language tag like "id" or "pt-br".')

const pendingSignup = and(
  eq(emailConsent.consentType, 'translator'),
  isNotNull(emailConsent.confirmedAt),
  isNull(emailConsent.unsubscribedAt),
  isNull(emailConsent.fulfilledAt)
)

type Ctx = {
  user: NonNullable<TRPCContext['user']>
  membership: NonNullable<TRPCContext['membership']>
}

/** A translator works in its assigned language only; admin+ may open any. */
async function workingLanguage(ctx: Ctx, requested: string | undefined): Promise<string | null> {
  if (ctx.membership.role === 'translator') {
    const [member] = await db
      .select({language: appMember.language})
      .from(appMember)
      .where(
        and(
          eq(appMember.userId, ctx.user.id),
          eq(appMember.organizationId, ctx.membership.organizationId)
        )
      )
      .limit(1)
    return member?.language ?? null
  }
  if (!roleAtLeast(ctx.membership.role, 'admin')) {
    throw new TRPCError({code: 'FORBIDDEN', message: 'Translation is for translators and admins.'})
  }
  return requested ?? null
}

/** One AI pass per deck per language: decks that already have drafts are left alone. */
async function firstPass(translate: NonNullable<TranslationDeps['translate']>, language: string) {
  const drafted = new Set(
    (
      await db
        .selectDistinct({deckSlug: translationDraft.deckSlug})
        .from(translationDraft)
        .where(eq(translationDraft.language, language))
    ).map((row) => row.deckSlug)
  )
  const calls = untranslatedDecks(language)
    .filter((deck) => !drafted.has(deck.slug))
    .flatMap((deck) =>
      chunk(deck.questions, QUESTIONS_PER_CALL).map(async (questions) => {
        const texts = await translate(language, questions)
        return questions.flatMap(({id}) => {
          const text = texts.get(id)?.trim()
          return text ? [{deckSlug: deck.slug, questionId: id, language, text}] : []
        })
      })
    )
  const rows = (await Promise.all(calls)).flat()
  if (rows.length > 0) await db.insert(translationDraft).values(rows).onConflictDoNothing()
  return rows.length
}

export const createTranslationRouter = ({translate, sendLogin}: TranslationDeps) =>
  createTRPCRouter({
    signups: roleProcedure('admin').query(() =>
      db
        .select({
          id: emailConsent.id,
          email: emailConsent.email,
          name: emailConsent.name,
          language: emailConsent.language,
          confirmedAt: emailConsent.confirmedAt,
        })
        .from(emailConsent)
        .where(pendingSignup)
        .orderBy(emailConsent.confirmedAt)
    ),

    /** The only way an AI pass runs: approve → first pass → `translator` user → login email. */
    approveSignup: roleProcedure('admin')
      .input(z.object({id: z.number().int(), language: languageSchema}))
      .mutation(async ({input}) => {
        const [signup] = await db
          .select({id: emailConsent.id, email: emailConsent.email})
          .from(emailConsent)
          .where(and(eq(emailConsent.id, input.id), pendingSignup))
          .limit(1)
        if (!signup) throw new TRPCError({code: 'NOT_FOUND', message: 'No pending sign-up.'})

        const email = signup.email.toLowerCase().trim()
        const [existing] = await db
          .select({role: appMember.role})
          .from(appMember)
          .innerJoin(appUser, eq(appMember.userId, appUser.id))
          .where(eq(appUser.email, email))
          .limit(1)
        if (existing && existing.role !== 'translator') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `${email} is already on the team as ${existing.role}.`,
          })
        }

        const drafted = translate ? await firstPass(translate, input.language) : null
        await addMember({email, role: 'translator', language: input.language})
        await sendLogin(email)
        await db
          .update(emailConsent)
          .set({fulfilledAt: new Date().toISOString()})
          .where(eq(emailConsent.id, signup.id))
        return {aiPass: drafted === null ? ('skipped' as const) : ('ran' as const), drafted}
      }),

    workspace: roleProcedure('translator')
      .input(z.object({language: languageSchema.optional()}))
      .query(async ({ctx, input}) => {
        const language = await workingLanguage(ctx, input.language)
        const languages = roleAtLeast(ctx.membership.role, 'admin')
          ? (
              await db
                .selectDistinct({language: translationDraft.language})
                .from(translationDraft)
                .orderBy(translationDraft.language)
            ).map((row) => row.language)
          : []
        if (!language) return {language, languages, decks: [], patch: ''}

        const drafts = await db
          .select()
          .from(translationDraft)
          .where(eq(translationDraft.language, language))
        const draftFor = new Map(drafts.map((d) => [`${d.deckSlug}/${d.questionId}`, d]))

        return {
          language,
          languages,
          decks: untranslatedDecks(language).map((deck) => ({
            ...deck,
            questions: deck.questions.map((q) => {
              const draft = draftFor.get(`${deck.slug}/${q.id}`)
              return {...q, text: draft?.text ?? '', status: draft?.status ?? null}
            }),
          })),
          patch: translationPatch(
            language,
            drafts.filter((d) => d.status === 'approved')
          ),
        }
      }),

    save: roleProcedure('translator')
      .input(
        z.object({
          language: languageSchema.optional(),
          deckSlug: z.string().min(1),
          questionId: z.string().min(1),
          text: z.string().trim().min(1).max(2000),
          status: z.enum(['draft', 'approved']),
        })
      )
      .mutation(async ({ctx, input}) => {
        const language = await workingLanguage(ctx, input.language)
        if (!language) throw new TRPCError({code: 'FORBIDDEN', message: 'No language assigned.'})
        const deck = untranslatedDecks(language).find((d) => d.slug === input.deckSlug)
        if (!deck?.questions.some((q) => q.id === input.questionId)) {
          throw new TRPCError({code: 'NOT_FOUND', message: 'Nothing to translate there.'})
        }

        await db
          .insert(translationDraft)
          .values({
            deckSlug: input.deckSlug,
            questionId: input.questionId,
            language,
            text: input.text,
            status: input.status,
            updatedBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: [
              translationDraft.deckSlug,
              translationDraft.questionId,
              translationDraft.language,
            ],
            set: {
              text: input.text,
              status: input.status,
              updatedBy: ctx.user.id,
              updatedAt: new Date(),
            },
          })
      }),
  })
