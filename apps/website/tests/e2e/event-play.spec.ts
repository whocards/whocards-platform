import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {expect, test} from '@playwright/test'
import type {Page} from '@playwright/test'

// Loaded via fs (rather than a JSON import) so the older repo Prettier/ESLint
// toolchain doesn't trip on import attributes.
const questions: Record<string, {en: string; hu: string}> = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../src/pages/events/hajnalig/_data/hajnalig-questions.json', import.meta.url)
    ),
    'utf8'
  )
)

// The hajnalig "SimplePlay" island (src/pages/events/hajnalig/_components/play.tsx):
//   - reads the starting question from ?q=<id>
//   - defaults language to Hungarian (hu) on first visit
//   - shows the question in an <h1>, with prev / language-toggle / next controls
//   - prev is disabled at the first question
//   - controls auto-hide after 3s of no mouse movement and reappear on mousemove
//
// Starting from ?q=1 makes the first rendered question deterministic (question id 1).

const q1 = questions['1']
const q2 = questions['2']

const heading = (page: Page) => page.getByRole('heading', {level: 1})

test.beforeEach(async ({page}) => {
  // Fresh localStorage so language defaults to Hungarian deterministically.
  await page.addInitScript(() => window.localStorage.clear())
})

test('loads the question selected by ?q= in the default (hu) language', async ({page}) => {
  await page.goto('/events/hajnalig/play?q=1')
  await expect(heading(page)).toHaveText(q1.hu)
})

test('next and previous navigate between questions', async ({page}) => {
  await page.goto('/events/hajnalig/play?q=1')
  await expect(heading(page)).toHaveText(q1.hu)

  // Previous is disabled on the first question.
  const prev = page.getByRole('button', {name: 'previous question'})
  await expect(prev).toBeDisabled()

  // With ?q=1 the order is the natural question order, so next -> question 2.
  await page.getByRole('button', {name: 'next question'}).click()
  await expect(heading(page)).toHaveText(q2.hu)

  // Previous becomes enabled and takes us back to question 1.
  await expect(prev).toBeEnabled()
  await prev.click()
  await expect(heading(page)).toHaveText(q1.hu)
})

test('language toggle switches between Hungarian and English', async ({page}) => {
  await page.goto('/events/hajnalig/play?q=1')
  await expect(heading(page)).toHaveText(q1.hu)

  // With two languages the control is a toggle button (between prev/next),
  // labelled "change language".
  const toggle = page.getByRole('button', {name: 'change language'})
  await toggle.click()
  await expect(heading(page)).toHaveText(q1.en)

  await toggle.click()
  await expect(heading(page)).toHaveText(q1.hu)
})

test('controls auto-hide after inactivity and reappear on mouse movement', async ({page}) => {
  await page.goto('/events/hajnalig/play?q=1')

  const next = page.getByRole('button', {name: 'next question'})
  await expect(next).toBeVisible()

  // The controls live in a container that fades to opacity-0 / pointer-events-none
  // after 3s of inactivity. (opacity:0 still counts as "visible" to Playwright, so
  // we assert the computed opacity rather than visibility.)
  const controls = page
    .locator('button[aria-label="next question"]')
    .locator('xpath=ancestor::div[2]')
  await expect(controls).toHaveCSS('opacity', '0', {timeout: 6000})

  // Any mouse movement brings the controls back.
  await page.mouse.move(400, 300)
  await page.mouse.move(420, 320)
  await expect(controls).toHaveCSS('opacity', '1')
})
