import {createServerFn} from '@tanstack/react-start'
import {getRequest} from '@tanstack/react-start/server'

import {auth} from './auth'
import {ensureMembership} from './bootstrap'
import {isAppRole} from './permissions'
import type {AppRole} from './permissions'

export type CurrentMember = {
  user: {id: string; email: string; name: string}
  /** null = signed in but not yet provisioned by an admin (see routes/_authed.tsx). */
  membership: {organizationId: string; role: AppRole} | null
}

/**
 * The one place that resolves "who is making this request" for both route
 * `beforeLoad` guards and tRPC context. Returns null when there's no valid
 * session at all (caller should redirect to /sign-in).
 */
export const getCurrentMember = createServerFn({method: 'GET'}).handler(
  async (): Promise<CurrentMember | null> => {
    const request = getRequest()
    const authSession = await auth.api.getSession({headers: request.headers})
    if (!authSession) return null

    const membership = await ensureMembership(authSession.user)
    // Defensive: a role that somehow isn't one of the five known roles is treated
    // as unprovisioned rather than trusted — should only happen if the DB was
    // edited by hand outside this app.
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
)
