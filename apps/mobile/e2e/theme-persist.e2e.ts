import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {button, closeSettings, launchClean, openSettings, relaunch, tapUntil} from './support'

// The screenshots show whether native styles repaint when the theme changes.
test('Dark, Light and System each survive a relaunch', async (fixtures) => {
  const {app, screen} = fixtures
  await launchClean(fixtures)
  let current = 'System'
  for (const theme of ['Dark', 'Light', 'System']) {
    await openSettings(screen)
    await tapUntil(button(screen, `Theme: ${current}`), button(screen, `Theme: ${theme}`))
    // Picking slides back to the menu, whose row then names the new theme.
    await tapUntil(button(screen, `Theme: ${theme}`), button(screen, `Theme: ${current}`), 'hidden')
    await expect(button(screen, `Theme: ${theme}`)).toBeVisible()
    await closeSettings(screen)
    await app.screenshot(`theme-${theme.toLowerCase()}`)
    await relaunch(fixtures)
    current = theme
  }
  await openSettings(screen)
  await expect(button(screen, 'Theme: System')).toBeVisible()
})
