import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {launchClean, openQuestion, pickLanguage, Q1, Q1_HE} from './support'

test('A chosen language survives a relaunch', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await pickLanguage(screen, 'English', 'Hebrew')

  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1_HE)).toBeVisible({timeout: 30_000})
  await expect(screen.getByText(Q1)).toBeHidden()

  // openQuestion closes the app first, so this is a cold start on the saved language.
  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1_HE)).toBeVisible({timeout: 30_000})
  await expect(screen.getByText(Q1)).toBeHidden()
})
