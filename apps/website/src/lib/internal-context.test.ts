import {describe, expect, it} from 'vitest'

import {isInternalDeployContext} from './internal-context'

// PostHog.astro flags is_internal on any Netlify build context other than
// 'production' (issue #178). These cases lock in the safe-by-default
// direction: unknown/missing context is treated as internal, not production.
describe('isInternalDeployContext', () => {
  it('is NOT internal for a production build', () => {
    expect(isInternalDeployContext('production')).toBe(false)
  })

  it('is internal for a deploy-preview build', () => {
    expect(isInternalDeployContext('deploy-preview')).toBe(true)
  })

  it('is internal for a branch-deploy build', () => {
    expect(isInternalDeployContext('branch-deploy')).toBe(true)
  })

  it('is internal for a local "dev" context', () => {
    expect(isInternalDeployContext('dev')).toBe(true)
  })

  it('is internal (safe default) when CONTEXT is unset', () => {
    expect(isInternalDeployContext(undefined)).toBe(true)
  })
})
