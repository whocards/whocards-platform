import {createAccessControl} from 'better-auth/plugins/access'
import {defaultStatements} from 'better-auth/plugins/organization/access'

/**
 * Custom organization roles (ADR-0008 / the overnight app-foundation plan). We
 * don't lean on better-auth's per-resource `hasPermission` checks — authorization
 * for this app is a simple 5-level hierarchy (see `ROLE_RANK` below), enforced by
 * our own tRPC middleware. This access-control instance exists only because the
 * organization plugin validates `member.role` against a configured role map; empty
 * statement sets are intentional.
 */
const ac = createAccessControl(defaultStatements)

export const roles = {
  owner: ac.newRole({}),
  admin: ac.newRole({}),
  facilitator: ac.newRole({}),
  reviewer: ac.newRole({}),
  member: ac.newRole({}),
}

export {ac}

/** The five app roles, lowest to highest. Keep in sync with `roles` above. */
export const ROLE_RANK = ['member', 'reviewer', 'facilitator', 'admin', 'owner'] as const

export type AppRole = (typeof ROLE_RANK)[number]

export const isAppRole = (value: string): value is AppRole =>
  (ROLE_RANK as readonly string[]).includes(value)

/** True when `role` is at least as senior as `min` in the ROLE_RANK hierarchy. */
export const roleAtLeast = (role: AppRole, min: AppRole): boolean =>
  ROLE_RANK.indexOf(role) >= ROLE_RANK.indexOf(min)
