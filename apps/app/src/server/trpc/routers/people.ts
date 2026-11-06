import {and, eq} from 'drizzle-orm'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {ensureDefaultOrganization} from '../../auth/bootstrap'
import {canAssignRole, STAFF_ROLES} from '../../auth/permissions'
import type {AppRole} from '../../auth/permissions'
import {db} from '../../db'
import {appMember, appUser} from '../../db/schema'
import {env} from '@whocards/env/app'
import {createTRPCRouter, roleProcedure} from '../trpc'

const roleSchema = z.enum(STAFF_ROLES)

/** Pre-provisions the app_user + app_member rows, so the person just signs in and lands with access. */
export async function addMember({
  email: rawEmail,
  role,
  language,
}: {
  email: string
  role: AppRole
  language?: string
}) {
  const org = await ensureDefaultOrganization()
  const email = rawEmail.toLowerCase().trim()

  const [existingUser] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1)
  const user =
    existingUser ??
    (
      await db
        .insert(appUser)
        .values({id: crypto.randomUUID(), email, name: email.split('@')[0] ?? email})
        .onConflictDoNothing()
        .returning()
    )[0]
  if (!user) throw new Error(`Failed to create or find user "${email}"`)

  const [existingMember] = await db
    .select()
    .from(appMember)
    .where(and(eq(appMember.organizationId, org.id), eq(appMember.userId, user.id)))
    .limit(1)

  if (existingMember) {
    const [updated] = await db
      .update(appMember)
      .set(language === undefined ? {role} : {role, language})
      .where(eq(appMember.id, existingMember.id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(appMember)
    .values({
      id: crypto.randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role,
      language: language ?? null,
      createdAt: new Date(),
    })
    .returning()
  return created
}

/** `admin+` manages people (route+action guard from the overnight build plan). */
export const peopleRouter = createTRPCRouter({
  list: roleProcedure('admin').query(async () => {
    const org = await ensureDefaultOrganization()
    const rows = await db
      .select({
        userId: appUser.id,
        email: appUser.email,
        name: appUser.name,
        role: appMember.role,
        joinedAt: appMember.createdAt,
      })
      .from(appMember)
      .innerJoin(appUser, eq(appMember.userId, appUser.id))
      .where(eq(appMember.organizationId, org.id))
    return rows.toSorted((a, b) => a.email.localeCompare(b.email))
  }),

  /** Invite by email (plan's simplified scope, no invite-token/accept flow
   *  tonight): pre-provisions the app_user + app_member rows with the given
   *  role, so the person just signs in with a magic link and lands with
   *  access already granted. */
  invite: roleProcedure('admin')
    .input(z.object({email: z.email(), role: roleSchema}))
    .mutation(async ({ctx, input}) => {
      if (!canAssignRole(ctx.membership.role, input.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only an owner can grant the owner role.',
        })
      }

      return addMember({email: input.email, role: input.role})
    }),

  updateRole: roleProcedure('admin')
    .input(z.object({userId: z.string().min(1), role: roleSchema}))
    .mutation(async ({ctx, input}) => {
      if (!canAssignRole(ctx.membership.role, input.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only an owner can grant the owner role.',
        })
      }

      const org = await ensureDefaultOrganization()

      const [target] = await db.select().from(appUser).where(eq(appUser.id, input.userId)).limit(1)
      if (
        target &&
        target.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase() &&
        input.role !== 'owner'
      ) {
        throw new Error(`${env.OWNER_EMAIL} is the seeded owner and can't be demoted here.`)
      }

      const [updated] = await db
        .update(appMember)
        .set({role: input.role})
        .where(and(eq(appMember.organizationId, org.id), eq(appMember.userId, input.userId)))
        .returning()
      if (!updated) throw new Error('That person is not a member of this organization.')
      return updated
    }),
})
