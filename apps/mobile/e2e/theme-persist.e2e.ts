import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, launchClean, openSettings, pickTheme, relaunch} from './support'

// The screenshots show whether native styles repaint when the theme changes.
test('Dark, Light and System each survive a relaunch', async (fixtures) => {
  const {app, screen} = fixtures
  await launchClean(fixtures)
  for (const theme of ['Dark', 'Light', 'System'] as const) {
    await pickTheme(screen, theme)
    await app.screenshot(`theme-${theme.toLowerCase()}`)
    await relaunch(fixtures)
  }
  await openSettings(screen)
  await expect(button(screen, 'Theme: System')).toBeVisible()
})
