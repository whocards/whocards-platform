import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  launchClean,
  openSettings,
  pickSetting,
  relaunch,
  startPlay,
} from './support'

test('The chosen Game survives a relaunch, in Settings and in the player', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickSetting(screen, 'Game', 'Pick a Card')

  await relaunch(fixtures)
  await openSettings(screen)
  await expect(screen.getByText('Pick a Card')).toBeVisible()
  await closeSettings(screen)
  await startPlay(screen)
  await expect(button(screen, 'Pick a card')).toBeVisible({timeout: 30_000})
})
