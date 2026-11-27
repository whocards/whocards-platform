import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  closeSheet,
  launchClean,
  pickLanguage,
  picker,
  revealControls,
  startPlay,
  swipeCard,
  tapUntil,
} from './support'

test('Play in Hebrew, swipe both ways, open Settings mid-play, and share', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickLanguage(screen, 'Hebrew')
  await startPlay(screen)

  await swipeCard(screen, 'left')
  await swipeCard(screen, 'right')

  // The player's gear shows the same sheet, Game included.
  await revealControls(screen)
  await tapUntil(button(screen, 'open settings'), closeSheet(screen))
  await expect(screen.getByText('Hebrew')).toBeVisible()
  await expect(picker(screen, 'Game')).toBeVisible()
  await closeSettings(screen)

  await revealControls(screen)
  await button(screen, 'share question').tap()
  await expect(button(screen, 'Share link')).toBeVisible()
})
