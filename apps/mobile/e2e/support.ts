// What the flows share: a clean launch, deep links into the player, and the Settings sheet.
import type {Device} from '@e2e-dev/mobile'
import type {Locator, Screen, TestFixtures} from 'e2e'
import {expect} from 'e2e'

import en from '../src/i18n/en.json'
import he from '../src/i18n/he.json'
import jp from '../src/i18n/jp.json'
import zh from '../src/i18n/zh.json'
import {NATIVE_LANGUAGE_NAMES} from '../src/lib/language-names'

export type Fixtures = TestFixtures & {device: Device}

const CATALOGS: Record<string, Partial<Record<keyof typeof en, string>>> = {en, he, jp, zh}
export type Language = 'en' | 'he' | 'jp' | 'zh'
// The app follows the device (English in the simulators) until a flow picks a Language.
let uiLanguage: Language = 'en'

/** The app's words for `key` in the Language the flow last picked. */
export const t = (key: keyof typeof en) => CATALOGS[uiLanguage]?.[key] ?? en[key]

/** A Language as its picker lists it, in its own words. */
export const languageName = (language: Language) => NATIVE_LANGUAGE_NAMES[language] ?? language

// Deep links pin the Pool's natural order, so q=N is always the same question.
export const Q1 = /most interesting thing you have learned recently/
export const Q1_HE = /מה הדבר הכי מעניין שלמדת לאחרונה/
export const Q2 = /something that makes you feel small/
export const Q5 = /What do you fear most at the moment/

// iOS reads Play as a link, Android as a plain group; both carry its label.
export const play = (screen: Screen) => screen.getByLabel(t('home.play'), {exact: true})
export const button = (screen: Screen, name: string | RegExp) => screen.getByRole('button', name)
// The sheet's X is a Pressable with no role, so only its label finds it.
export const closeSheet = (screen: Screen) => screen.getByLabel(t('a11y.close'), {exact: true})

const settled = (step: Promise<unknown>) =>
  step.then(
    () => true,
    () => false
  )
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Taps `target` until `until` reaches `state`: a tap while a sheet or alert is still animating is dropped or refused. */
export async function tapUntil(
  target: Locator,
  until: Locator,
  state: 'visible' | 'hidden' = 'visible'
) {
  for (let tries = 3; tries > 0; tries--) {
    await settled(target.tap())
    if (await settled(until.waitFor({state, timeout: 3_000}))) return
  }
  await (state === 'visible' ? expect(until).toBeVisible() : expect(until).toBeHidden())
}

/** The app relaunched with no saved settings, on the landing. */
export async function launchClean({app, device, platform, screen}: Fixtures) {
  // A deep-link prompt a failed flow left up holds every launch after it.
  if (platform === 'ios') await settled(device.alert('dismiss'))
  await app.clearState()
  uiLanguage = 'en'
  await expect(play(screen)).toBeVisible({timeout: 60_000})
}

/** The app relaunched with its saved settings, on the landing. */
export async function relaunch({app, screen}: Fixtures) {
  await app.restart()
  await expect(play(screen)).toBeVisible({timeout: 60_000})
  await declineDailyQuestion(screen)
}

/** Answers "Not now" to "Get a daily question?", which the app asks 2 s into its second open. */
async function declineDailyQuestion(screen: Screen) {
  const notNow = button(screen, t('prompt.notNow'))
  if (await settled(notNow.waitFor({timeout: 5_000}))) await tapUntil(notNow, notNow, 'hidden')
}

/** Opens question `q` of the library deck by deep link, cold unless `warm`. */
export async function openQuestion(fixtures: Fixtures, q: number, {warm = false} = {}) {
  const {device, platform, screen} = fixtures
  if (!warm) await device.closeApp()
  await device.openLink(`mobile://play/library?q=${q}`)
  // iOS may ask "Open in “WhoCards”?" first, and until it's answered the app can't be read.
  const end = platform === 'ios' ? Date.now() + (warm ? 5_000 : 15_000) : 0
  while (Date.now() < end) {
    if (await settled(device.alert('accept'))) break
    if (!warm && (await settled(card(screen)))) break
    await pause(500)
  }
  if (!warm) await declineDailyQuestion(screen)
}

/** Plays the deck from the landing. */
export const startPlay = (screen: Screen) => tapUntil(play(screen), play(screen), 'hidden')

/** The frame of the card's question: the largest text on screen (Android also lists the hidden controls' labels). */
async function card(screen: Screen) {
  const boxes = await Promise.all(
    (await screen.getByText(/\S/).all()).map((text) => text.boundingBox().catch(() => null))
  )
  const box = boxes.reduce((a, b) => (b && (!a || b.width * b.height > a.width * a.height) ? b : a))
  if (!box) throw new Error('e2e: no question on screen')
  return box
}

/** A tap on the card's question, which brings back the player's auto-hiding controls. */
export async function revealControls(screen: Screen) {
  const box = await card(screen)
  await screen.tapAt({x: box.x + box.width / 2, y: box.y + box.height / 2})
}

/** Swipes the card left (on to the next question) or right (back). */
export async function swipeCard(screen: Screen, direction: 'left' | 'right') {
  const box = await card(screen)
  const y = box.y + box.height / 2
  const [from, to] = [box.x + box.width * 0.9, box.x + box.width * 0.1]
  await screen.swipe(
    direction === 'left'
      ? {from: {x: from, y}, to: {x: to, y}, duration: 300}
      : {from: {x: to, y}, to: {x: from, y}, duration: 300}
  )
}

/** Opens the Settings sheet from the landing. */
export const openSettings = (screen: Screen) =>
  tapUntil(button(screen, t('home.settings')), closeSheet(screen))

/** Closes the Settings sheet. */
export const closeSettings = (screen: Screen) =>
  tapUntil(closeSheet(screen), closeSheet(screen), 'hidden')

/** A Settings picker, by its row's label: "Language" on iOS, "Language: English" on Android, never Second language. */
export const picker = (screen: Screen, label: string) =>
  button(screen, new RegExp(`^${label}(: .*)?$`))

/** Opens Settings from the landing, picks the Language `to`, and closes it; the app's words follow it. */
export async function pickLanguage(screen: Screen, to: Language, onMenuOpen?: () => Promise<void>) {
  const option = screen.getByText(languageName(to))
  await openSettings(screen)
  await tapUntil(picker(screen, t('settings.language')), option)
  await onMenuOpen?.()
  // The pick sets the value and closes the menu on its own.
  await option.tap()
  uiLanguage = to
  await closeSettings(screen)
}

/** Opens Settings from the landing, turns on Pick a Card on the Gameplay page, and closes it. */
export async function turnOnPickACard(screen: Screen) {
  const pickACard = screen.getByLabel(t('settings.pickACard'), {exact: true})
  await openSettings(screen)
  await tapUntil(button(screen, t('settings.gameplay')), pickACard)
  await pickACard.tap()
  await closeSettings(screen)
}

/** Opens Settings from the landing, taps a Theme segment, and closes it. */
export async function pickTheme(screen: Screen, theme: 'System' | 'Light' | 'Dark') {
  await openSettings(screen)
  await button(screen, `${t('settings.theme')}: ${t(`settings.theme${theme}`)}`).tap()
  await closeSettings(screen)
}
