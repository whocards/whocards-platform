import {describe, expect, it} from 'vitest'

import {netlifySiteUrl} from './netlify'

const local = 'http://localhost:4321'
const deploy = {
  NETLIFY: 'true',
  URL: 'https://whocards.cc',
  DEPLOY_PRIME_URL: 'https://deploy-preview-1--whocards-calmly.netlify.app',
}

describe('netlifySiteUrl', () => {
  it('uses the fallback off Netlify', () => {
    expect(netlifySiteUrl({CONTEXT: 'production', URL: deploy.URL}, local)).toBe(local)
  })

  it('uses the primary URL in production', () => {
    expect(netlifySiteUrl({...deploy, CONTEXT: 'production'}, local)).toBe(deploy.URL)
  })

  it("uses the deploy's own URL in previews", () => {
    expect(netlifySiteUrl({...deploy, CONTEXT: 'deploy-preview'}, local)).toBe(
      deploy.DEPLOY_PRIME_URL
    )
  })

  it('is undefined on Netlify when the URL is missing', () => {
    expect(netlifySiteUrl({NETLIFY: 'true', CONTEXT: 'production'}, local)).toBeUndefined()
  })
})
