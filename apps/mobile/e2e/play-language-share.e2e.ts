import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  closeSheet,
  launchClean,
  pickSetting,
  questionText,
  revealControls,
  startPlay,
  swipeCard,
  tapUntil,
} from './support'

test('Play in Hebrew, swipe both ways, open Settings mid-play, and share', async (fixtures) => {
  const {device, platform, screen} = fixtures
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

  // Dismissing the OS share sheet leaves the player live (iOS froze here: the outside tap reached our backdrop).
  await tapUntil(button(screen, 'Share link'), button(screen, 'Share link'), 'hidden')
  if (platform === 'ios') await screen.tapAt({x: 200, y: 150})
  else await device.back()
  await expect(button(screen, 'Share link')).toBeVisible()
  await tapUntil(closeSheet(screen), closeSheet(screen), 'hidden')

  const shared = await questionText(screen)
  await swipeCard(screen, 'left')
  await expect(screen.getByText(shared, {exact: true})).toBeHidden()
})
