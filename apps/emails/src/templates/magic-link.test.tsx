import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {MagicLinkEmail, magicLinkSubject, magicLinkText} from './magic-link'

const url = 'https://whocards-app.netlify.app/api/auth/magic-link/verify?token=abc123'

describe('MagicLinkEmail', () => {
  it('renders a sign-in button linking to the magic-link URL', async () => {
    const html = await render(<MagicLinkEmail url={url} />)
    expect(html).toContain(url)
    expect(html).toContain('Sign in')
  })

  it('has a fixed, descriptive subject', () => {
    expect(magicLinkSubject).toBe('Sign in to WhoCards @ Work')
  })

  it('provides a complete plain-text fallback with the link', () => {
    const text = magicLinkText({url})
    expect(text).toContain(url)
    expect(text).toContain('Sign in to WhoCards @ Work')
  })
})
