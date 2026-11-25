import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  closeSettings,
  launchClean,
  openSettings,
  pickSetting,
  play,
  revealControls,
  startPlay,
  tapUntil,
} from './support'

// The screenshots show the Card in the bundled Noto faces (issue #1); Japanese is told apart by its kana.
const CARDS = [
  {language: 'Mandarin', code: 'zh', text: /[\u4e00-\u9fff]/},
  {language: 'Japanese', code: 'jp', text: /[\u3040-\u30ff]/},
]

test('A Mandarin and a Japanese card render, in Light and in Dark', async (fixtures) => {
  const {app, screen} = fixtures
  await launchClean(fixtures)
  let theme = 'System'
  let language = 'English'
  for (const next of ['Light', 'Dark']) {
    await openSettings(screen)
    await tapUntil(button(screen, `Theme: ${theme}`), button(screen, `Theme: ${next}`))
    await tapUntil(button(screen, `Theme: ${next}`), button(screen, `Theme: ${theme}`), 'hidden')
    await closeSettings(screen)
    theme = next
    for (const card of CARDS) {
      await pickSetting(screen, `Language: ${language}`, card.language)
      language = card.language
      await startPlay(screen)
      await expect(screen.getByText(card.text)).toBeVisible()
      await app.screenshot(`${card.code}-${theme.toLowerCase()}`)
      await revealControls(screen)
      await tapUntil(button(screen, 'exit deck'), play(screen))
    }
  }
})
