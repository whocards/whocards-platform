import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  closeSheet,
  languageName,
  launchClean,
  pickLanguage,
  picker,
  revealControls,
  startPlay,
  swipeCard,
  t,
  tapUntil,
} from './support'

test('Play in Hebrew, swipe both ways, open Settings mid-play, and share', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickLanguage(screen, 'he')
  await startPlay(screen)

  await swipeCard(screen, 'left')
  await swipeCard(screen, 'right')

  // The player's gear shows the same sheet, Gameplay included.
  await revealControls(screen)
  await tapUntil(button(screen, t('a11y.openSettings')), closeSheet(screen))
  await expect(screen.getByText(languageName('he'))).toBeVisible()
  await expect(picker(screen, t('settings.gameplay'))).toBeVisible()
  await closeSettings(screen)

  await revealControls(screen)
  await button(screen, t('a11y.shareQuestion')).tap()
  await expect(button(screen, t('share.link'))).toBeVisible()
})
