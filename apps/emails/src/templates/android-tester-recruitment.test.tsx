import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {
  AndroidTesterRecruitmentEmail,
  androidTesterRecruitmentText,
} from './android-tester-recruitment'

const signupUrl = 'https://example.com/android-testers'

describe('AndroidTesterRecruitmentEmail', () => {
  it('renders the signup link and release expectation', async () => {
    const html = await render(<AndroidTesterRecruitmentEmail signupUrl={signupUrl} />)
    expect(html).toContain(signupUrl)
    expect(html).toContain('Android people, we need you')
    expect(html).toContain('first test release is available')
    expect(html).toContain('Forward this their way')
  })

  it('provides a complete plain-text fallback', () => {
    const text = androidTesterRecruitmentText({signupUrl})
    expect(text).toContain(signupUrl)
    expect(text).toContain('ANDROID PEOPLE, WE NEED YOU')
    expect(text).toContain('private download and installation link')
    expect(text).toContain('Forward this their way')
  })
})
