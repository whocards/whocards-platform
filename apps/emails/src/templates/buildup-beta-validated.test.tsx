import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {BetaValidatedEmail, betaValidatedText} from './buildup-beta-validated'

const playUrl = 'https://example.com/play'
const greeting = 'Hi test friend,'

describe('BetaValidatedEmail', () => {
  it('renders the play CTA and a Question without promising a launch date', async () => {
    const html = await render(<BetaValidatedEmail playUrl={playUrl} greeting={greeting} />)
    expect(html).toContain(playUrl)
    expect(html).toContain(greeting)
    expect(html).toContain('WHILE YOU WAIT')
    // No concrete date promise.
    expect(html).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
    )
  })

  it('provides a complete plain-text fallback', () => {
    const text = betaValidatedText({playUrl, greeting})
    expect(text).toContain(playUrl)
    expect(text).toContain(greeting)
    expect(text).toContain('WHILE YOU WAIT')
  })
})
