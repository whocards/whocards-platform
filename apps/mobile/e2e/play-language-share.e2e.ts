import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  closeSheet,
  launchClean,
  pickSetting,
  revealControls,
  startPlay,
  swipeCard,
  tapUntil,
} from './support'

test('Play in Hebrew, swipe both ways, open Settings mid-play, and share', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickSetting(screen, 'Language: English', 'Hebrew')
  await startPlay(screen)

  await swipeCard(screen, 'left')
  await swipeCard(screen, 'right')

  // The player's gear shows the same sheet, without the Game row.
  await revealControls(screen)
  await tapUntil(button(screen, 'open settings'), closeSheet(screen))
  await expect(button(screen, 'Language: Hebrew')).toBeVisible()
  await expect(button(screen, /^Game: /)).toBeHidden()
  await closeSettings(screen)

  await revealControls(screen)
  await button(screen, 'share question').tap()
  await expect(button(screen, 'Share link')).toBeVisible()
})
