import {test} from '@e2e-dev/mobile'
import {expect} from 'e2e'

import {
  button,
  launchClean,
  pickLanguage,
  pickTheme,
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
  for (const theme of ['Light', 'Dark']) {
    await pickTheme(screen, theme)
    for (const card of CARDS) {
      await pickLanguage(screen, card.language)
      await startPlay(screen)
      await expect(screen.getByText(card.text)).toBeVisible()
      await app.screenshot(`${card.code}-${theme.toLowerCase()}`)
      await revealControls(screen)
      await tapUntil(button(screen, 'exit deck'), play(screen))
    }
  }
})
