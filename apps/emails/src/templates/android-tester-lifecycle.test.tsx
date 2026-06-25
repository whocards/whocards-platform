import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {
  AndroidTesterCheckInEmail,
  AndroidTesterCompletionEmail,
  AndroidTesterOnboardingEmail,
  androidTesterCheckInText,
  androidTesterCompletionText,
  androidTesterOnboardingText,
} from './android-tester-lifecycle'

describe('Android tester lifecycle', () => {
  it('renders onboarding links and Google-account instructions', async () => {
    const props = {
      groupUrl: 'https://groups.example/join',
      optInUrl: 'https://play.example/opt-in',
      feedbackUrl: 'https://feedback.example',
    }
    const html = await render(<AndroidTesterOnboardingEmail {...props} />)
    expect(html).toContain(props.optInUrl)
    expect(html).toContain(props.groupUrl)
    expect(html).toContain('same Google account')
    expect(androidTesterOnboardingText(props)).toContain(props.feedbackUrl)
  })

  it('renders the focused day-7 check-in', async () => {
    const feedbackUrl = 'https://feedback.example'
    const html = await render(<AndroidTesterCheckInEmail feedbackUrl={feedbackUrl} />)
    expect(html).toContain('most confusing or frustrating moment')
    expect(androidTesterCheckInText({feedbackUrl})).toContain(feedbackUrl)
  })

  it('keeps completion separate from newsletter consent', async () => {
    const html = await render(<AndroidTesterCompletionEmail />)
    expect(html).toContain('does not add')
    expect(androidTesterCompletionText()).toContain('does not add')
  })
})
