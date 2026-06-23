import {render} from '@react-email/render'
import {describe, expect, it} from 'vitest'

import {AppLaunchAnnouncementEmail, appLaunchAnnouncementText} from './app-launch-announcement'

const appStoreUrl = 'https://example.com/app-store'
const playStoreUrl = 'https://example.com/play-store'
const greeting = 'Hi test friend,'

describe('AppLaunchAnnouncementEmail', () => {
  it('renders both store links and launch copy', async () => {
    const html = await render(
      <AppLaunchAnnouncementEmail
        appStoreUrl={appStoreUrl}
        playStoreUrl={playStoreUrl}
        greeting={greeting}
      />
    )
    expect(html).toContain(appStoreUrl)
    expect(html).toContain(playStoreUrl)
    expect(html).toContain('WhoCards is now in your pocket')
    expect(html).toContain(greeting)
    expect(html).toContain('Download WhoCards now')
  })

  it('provides a complete plain-text fallback', () => {
    const text = appLaunchAnnouncementText({appStoreUrl, playStoreUrl, greeting})
    expect(text).toContain(appStoreUrl)
    expect(text).toContain(playStoreUrl)
    expect(text).toContain("It's live")
    expect(text).toContain('DOWNLOAD WHOCARDS NOW')
    expect(text).toContain(greeting)
  })
})
