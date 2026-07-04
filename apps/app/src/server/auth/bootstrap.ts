import {and, eq} from 'drizzle-orm'

import {db} from '../db'
import {appMember, appOrganization} from '../db/schema'
import {env} from '../env'

/** The single implicit organization every member belongs to tonight (no multi-org
 *  UI yet — that's the future Tier 2 "WhoCards for Teams" build this app founds). */
const DEFAULT_ORG_SLUG = 'whocards'
const DEFAULT_ORG_NAME = 'WhoCards'

/** Exported for the people router (needs the org id to list/invite members). */
export async function ensureDefaultOrganization() {
  const [existing] = await db
    .select()
    .from(appOrganization)
    .where(eq(appOrganization.slug, DEFAULT_ORG_SLUG))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(appOrganization)
    .values({
      id: crypto.randomUUID(),
      name: DEFAULT_ORG_NAME,
      slug: DEFAULT_ORG_SLUG,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()
  if (created) return created

  // Lost a create race — re-read.
  const [afterRace] = await db
    .select()
    .from(appOrganization)
    .where(eq(appOrganization.slug, DEFAULT_ORG_SLUG))
    .limit(1)
  if (afterRace) return afterRace

  // Should be unreachable: a concurrent insert either wins (returned above) or
  // conflicts against a row that must then be readable by the re-select.
  throw new Error(`Failed to create or find the default organization "${DEFAULT_ORG_SLUG}"`)
}

export type Membership = {organizationId: string; role: string}

/**
 * Looks up the caller's membership in the default org. If none exists and the
 * signed-in email matches OWNER_EMAIL, seeds them as `owner` on the spot (the
 * plan's "seed avicharlop@gmail.com as owner on first sign-in"). Otherwise
 * returns null — signed in, but not yet provisioned by an admin (see
 * routes/_authed.tsx, which renders a "not yet invited" state for that case).
 */
export async function ensureMembership(user: {
  id: string
  email: string
}): Promise<Membership | null> {
  const org = await ensureDefaultOrganization()

  const [existing] = await db
    .select()
    .from(appMember)
    .where(and(eq(appMember.organizationId, org.id), eq(appMember.userId, user.id)))
    .limit(1)
  if (existing) return {organizationId: existing.organizationId, role: existing.role}

  if (user.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return null

  const [seeded] = await db
    .insert(appMember)
    .values({
      id: crypto.randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()
  if (seeded) return {organizationId: seeded.organizationId, role: seeded.role}

  // Lost a create race — re-read rather than fail the sign-in.
  const [afterRace] = await db
    .select()
    .from(appMember)
    .where(and(eq(appMember.organizationId, org.id), eq(appMember.userId, user.id)))
    .limit(1)
  return afterRace ? {organizationId: afterRace.organizationId, role: afterRace.role} : null
}
