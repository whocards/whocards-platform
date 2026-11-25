import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  launchClean,
  pickSetting,
  play,
  revealControls,
  startPlay,
  tapUntil,
} from './support'

// Alignment is checked by eye on the screenshots: English reads left-aligned, Hebrew right.
test('A card reads left-aligned in English and right-aligned in Hebrew', async (fixtures) => {
  const {app, screen} = fixtures
  await launchClean(fixtures)
  await startPlay(screen)
  await expect(play(screen)).toBeHidden()
  await revealControls(screen)
  await app.screenshot('en-ltr')

  await tapUntil(button(screen, 'exit deck'), play(screen))
  await pickSetting(screen, 'Language: English', 'Hebrew')
  await startPlay(screen)
  await revealControls(screen)
  await app.screenshot('he-rtl')
})
