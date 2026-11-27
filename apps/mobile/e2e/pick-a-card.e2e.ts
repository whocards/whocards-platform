import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, launchClean, pickSetting, startPlay} from './support'

// Pick a Card shuffles, so the flow follows the deal buttons, not question text.
test('Pick a Card deals a card, puts it down, and Back re-reads it', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickSetting(screen, 'Game', 'Pick a Card')
  await startPlay(screen)

  const pick = button(screen, 'Pick a card')
  await expect(pick).toBeVisible({timeout: 30_000})
  await expect(button(screen, 'Tap to pick a card')).toBeVisible()
  await pick.tap()
  await expect(pick).toBeHidden()

  // A tap anywhere on the dealt card puts it down.
  await screen.tapAt({x: 200, y: 400})
  await expect(pick).toBeVisible()

  // Above the deck, so the tap only brings the controls back.
  const deck = await pick.boundingBox()
  if (!deck) throw new Error('e2e: the pick button has no frame')
  await screen.tapAt({x: deck.x + deck.width / 2, y: deck.y / 2})
  await button(screen, 'previous question').tap()
  await expect(pick).toBeHidden()
})
