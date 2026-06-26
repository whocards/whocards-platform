import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {WaitlistLiveEmail, waitlistLiveText} from './buildup-waitlist-live'

const appUrl = 'https://example.com/app'
const greeting = 'Hi test friend,'

describe('WaitlistLiveEmail', () => {
  it('renders the /app CTA, a Question, and the reply prompt', async () => {
    const html = await render(<WaitlistLiveEmail appUrl={appUrl} greeting={greeting} />)
    expect(html).toContain(appUrl)
    expect(html).toContain(greeting)
    expect(html).toContain('A QUESTION TO CARRY')
    expect(html).toContain('hit reply')
  })

  it('provides a complete plain-text fallback', () => {
    const text = waitlistLiveText({appUrl, greeting})
    expect(text).toContain(appUrl)
    expect(text).toContain(greeting)
    expect(text).toContain('A QUESTION TO CARRY')
  })
})
