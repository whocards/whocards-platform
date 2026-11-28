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
  t,
  tapUntil,
} from './support'

// The screenshots show the Card in the bundled Noto faces (issue #1); Japanese is told apart by its kana.
const CARDS = [
  {language: 'zh', text: /[\u4e00-\u9fff]/},
  {language: 'jp', text: /[\u3040-\u30ff]/},
] as const

test('A Mandarin and a Japanese card render, in Light and in Dark', async (fixtures) => {
  const {app, screen} = fixtures
  await launchClean(fixtures)
  for (const theme of ['Light', 'Dark'] as const) {
    await pickTheme(screen, theme)
    for (const card of CARDS) {
      await pickLanguage(screen, card.language)
      await startPlay(screen)
      await expect(screen.getByText(card.text)).toBeVisible()
      await app.screenshot(`${card.language}-${theme.toLowerCase()}`)
      await revealControls(screen)
      await tapUntil(button(screen, t('a11y.exitDeck')), play(screen))
    }
  }
})
