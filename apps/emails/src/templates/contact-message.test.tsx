import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {
  ContactMessageEmail,
  contactMessageSubject,
  contactMessageText,
} from './contact-message'

const props = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Loved the deck.\nCan we order 10 for our team?',
}

describe('ContactMessageEmail', () => {
  it('renders the sender, a mailto link, and the message', async () => {
    const html = await render(<ContactMessageEmail {...props} />)
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('mailto:ada@example.com')
    expect(html).toContain('Loved the deck.')
    expect(html).toContain('Can we order 10 for our team?')
    expect(html).toContain('whocards.cc/contact')
  })

  it('builds a subject from the sender name', () => {
    expect(contactMessageSubject('Ada Lovelace')).toBe('Contact form: Ada Lovelace')
  })

  it('provides a complete plain-text fallback', () => {
    const text = contactMessageText(props)
    expect(text).toContain('Ada Lovelace')
    expect(text).toContain('ada@example.com')
    expect(text).toContain('Can we order 10 for our team?')
  })
})
