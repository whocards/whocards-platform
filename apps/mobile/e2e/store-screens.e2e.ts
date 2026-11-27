import {join} from 'node:path'

import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {screenshot} from '../scripts/devices.mjs'
import {
  button,
  launchClean,
  openQuestion,
  pickLanguage,
  play,
  Q1,
  Q1_HE,
  revealControls,
  t,
  tapUntil,
} from './support'

// `pnpm -F mobile screenshots` runs this with STORE_DIR set; the frames go to the store listing.
const shoot = (name: string) => {
  const {E2E_DEVICE, STORE_DIR} = process.env
  if (!E2E_DEVICE || !STORE_DIR) throw new Error('e2e: run through `pnpm -F mobile screenshots`')
  screenshot(E2E_DEVICE, join(STORE_DIR, `${name}.png`))
}

test('Store listing frames', {tags: ['screenshots']}, async (fixtures) => {
  const {screen} = fixtures
  await launchClean(fixtures)
  // The landing's entrance animation runs on after Play is tappable.
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  shoot('01-landing')

  // Cards are shot once the controls have hidden themselves.
  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1)).toBeVisible({timeout: 30_000})
  await expect(button(screen, 'next question')).toBeHidden({timeout: 10_000})
  shoot('02-card-en')

  await revealControls(screen)
  await tapUntil(button(screen, 'exit deck'), play(screen))
  await expect(play(screen)).toBeVisible()
  await pickLanguage(screen, 'he', async () => {
    // The menu is still opening when its options first show.
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    shoot('03-language-picker')
  })
  await openQuestion(fixtures, 1)
  await expect(screen.getByText(Q1_HE)).toBeVisible({timeout: 30_000})
  await expect(button(screen, t('a11y.nextQuestion'))).toBeHidden({timeout: 10_000})
  shoot('04-card-he')
})
