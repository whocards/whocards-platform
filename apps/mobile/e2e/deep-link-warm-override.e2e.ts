import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {launchClean, openQuestion, Q1, Q2, Q5, swipeCard} from './support'

// expo-router reuses the mounted player on a warm link; it's keyed on deck+q+lang so it remounts.
test('A warm deep link moves the open player to its question', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1)).toBeVisible({timeout: 30_000})
  await swipeCard(screen, 'left')
  await expect(screen.getByText(Q2)).toBeVisible()

  await openQuestion(fixtures, 5, {warm: true})
  await expect(screen.getByText(Q5)).toBeVisible({timeout: 30_000})
  await expect(screen.getByText(Q2)).toBeHidden()
})
