import {APIError, createAuthMiddleware, getSessionFromCtx} from 'better-auth/api'

// Better Auth's organization endpoints only check membership, and a translator is a member.
export const translatorsOffOrganizationEndpoints = createAuthMiddleware(async (ctx) => {
  if (!ctx.path.startsWith('/organization/')) return
  const session = await getSessionFromCtx(ctx)
  if (!session) return
  const members = await ctx.context.adapter.findMany<{role: string}>({
    model: 'member',
    where: [{field: 'userId', value: session.user.id}],
  })
  if (members.some((m) => m.role.split(',').includes('translator'))) {
    throw new APIError('FORBIDDEN', {message: 'Translators have no organization access.'})
  }
})
