import {describe, expect, it} from 'vitest'

import {canAssignRole, isAppRole, ROLE_RANK, roleAtLeast} from './permissions'

describe('ROLE_RANK', () => {
  it('is the five roles, lowest to highest', () => {
    expect(ROLE_RANK).toEqual(['member', 'reviewer', 'facilitator', 'admin', 'owner'])
  })
})

describe('isAppRole', () => {
  it('accepts each of the five known roles', () => {
    for (const role of ROLE_RANK) expect(isAppRole(role)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isAppRole('superadmin')).toBe(false)
    expect(isAppRole('')).toBe(false)
    expect(isAppRole('Owner')).toBe(false) // case-sensitive
  })
})

describe('roleAtLeast', () => {
  it('is true when role is exactly the minimum', () => {
    for (const role of ROLE_RANK) expect(roleAtLeast(role, role)).toBe(true)
  })

  it('is true when role outranks the minimum', () => {
    expect(roleAtLeast('owner', 'member')).toBe(true)
    expect(roleAtLeast('admin', 'facilitator')).toBe(true)
    expect(roleAtLeast('facilitator', 'reviewer')).toBe(true)
  })

  it('is false when role is below the minimum', () => {
    expect(roleAtLeast('member', 'reviewer')).toBe(false)
    expect(roleAtLeast('reviewer', 'facilitator')).toBe(false)
    expect(roleAtLeast('facilitator', 'admin')).toBe(false)
    expect(roleAtLeast('admin', 'owner')).toBe(false)
  })

  it('matches the plan guardrails: facilitator+ can approve, admin+ manages people', () => {
    // facilitator+ (facilitator, admin, owner) — the approve action
    expect(roleAtLeast('facilitator', 'facilitator')).toBe(true)
    expect(roleAtLeast('admin', 'facilitator')).toBe(true)
    expect(roleAtLeast('owner', 'facilitator')).toBe(true)
    expect(roleAtLeast('reviewer', 'facilitator')).toBe(false)
    expect(roleAtLeast('member', 'facilitator')).toBe(false)

    // admin+ (admin, owner) — people management
    expect(roleAtLeast('admin', 'admin')).toBe(true)
    expect(roleAtLeast('owner', 'admin')).toBe(true)
    expect(roleAtLeast('facilitator', 'admin')).toBe(false)
  })
})

describe('canAssignRole', () => {
  it('lets an owner grant every role, including owner', () => {
    for (const target of ROLE_RANK) expect(canAssignRole('owner', target)).toBe(true)
  })

  it('lets an admin grant any role up to admin', () => {
    expect(canAssignRole('admin', 'member')).toBe(true)
    expect(canAssignRole('admin', 'reviewer')).toBe(true)
    expect(canAssignRole('admin', 'facilitator')).toBe(true)
    expect(canAssignRole('admin', 'admin')).toBe(true)
  })

  it('blocks an admin from granting owner — the deny path', () => {
    expect(canAssignRole('admin', 'owner')).toBe(false)
  })

  it('blocks every below-owner role from granting owner', () => {
    expect(canAssignRole('facilitator', 'owner')).toBe(false)
    expect(canAssignRole('reviewer', 'owner')).toBe(false)
    expect(canAssignRole('member', 'owner')).toBe(false)
  })
})
