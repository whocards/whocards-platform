import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, launchClean, openQuestion, Q1, revealControls, tapUntil} from './support'

// iOS's share sheet doesn't expose the link as text; src/__tests__/share-url.test.ts covers the URL.
test(
  "Share puts the question's web link on Android's share sheet",
  {platforms: ['android']},
  async (fixtures) => {
    const {screen} = fixtures
    await launchClean(fixtures)
    await openQuestion(fixtures, 1)
    await expect(screen.getByText(Q1)).toBeVisible({timeout: 30_000})
    await revealControls(screen)
    await button(screen, 'share question').tap()
    // A cold emulator's first share sheet can fail to open, so Share link is tapped again until it does.
    const link = screen.getByText(/whocards\.cc\/play.*q=1/)
    await tapUntil(button(screen, 'Share link'), link)
  }
)
