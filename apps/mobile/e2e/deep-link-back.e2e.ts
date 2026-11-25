import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, launchClean, openQuestion, play, Q1, revealControls, tapUntil} from './support'

test('A cold deep link opens question 1, and Exit returns to the landing', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1)).toBeVisible({timeout: 30_000})
  await revealControls(screen)
  await tapUntil(button(screen, 'exit deck'), play(screen))
  await expect(play(screen)).toBeVisible()
})
