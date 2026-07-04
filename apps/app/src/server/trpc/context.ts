import {getRequest} from '@tanstack/react-start/server'

import {auth} from '../auth/auth'
import {ensureMembership} from '../auth/bootstrap'
import {isAppRole} from '../auth/permissions'
import type {AppRole} from '../auth/permissions'

export type TRPCContext = {
  user: {id: string; email: string; name: string} | null
  membership: {organizationId: string; role: AppRole} | null
}

/** Built once per tRPC request (see routes/api/trpc/$.ts). Mirrors
 *  server/auth/session.ts's getCurrentMember, but as a plain async function —
 *  tRPC's fetch adapter builds context itself, it doesn't go through a
 *  TanStack Start server function. */
export async function createTRPCContext(): Promise<TRPCContext> {
  const request = getRequest()
  const authSession = await auth.api.getSession({headers: request.headers})
  if (!authSession) return {user: null, membership: null}

  const membership = await ensureMembership(authSession.user)
  const validMembership =
    membership && isAppRole(membership.role)
      ? {organizationId: membership.organizationId, role: membership.role}
      : null

  return {
    user: {
      id: authSession.user.id,
      email: authSession.user.email,
      name: authSession.user.name,
    },
    membership: validMembership,
  }
}
