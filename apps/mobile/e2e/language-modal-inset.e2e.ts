import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, launchClean, openSettings, tapUntil} from './support'

// The header clearing the status bar is checked by eye on this flow's screenshot, and in jest
// by src/__tests__/settings-sheet-header.test.tsx.
test('The language page opens from Settings', async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  await openSettings(screen)
  await tapUntil(button(screen, 'Language: English'), screen.getByText('Choose your language'))
  await expect(screen.getByText('Choose your language')).toBeVisible()
})
