import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import type {Page} from '@playwright/test'
import {expect, test} from '@playwright/test'

// The library `/play` route (SSR) renders the shared <Play> island, which now
// drives the headless engine from @whocards/decks. The Pool is loaded via fs
// (rather than a JSON import) to keep deterministic assertions on question text.
const pool: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/data/questions.json', import.meta.url)), 'utf8')
)

// With ?q=1 the deck starts on question id 1 and keeps natural pool order behind
// it, so navigation is deterministic (id 1 -> id 2 -> ...).
const q1 = pool['1']
const q2 = pool['2']

const heading = (page: Page) => page.getByRole('heading', {level: 1})

test.beforeEach(async ({page}) => {
  // Fresh localStorage so the chosen language is deterministic per test.
  await page.addInitScript(() => window.localStorage.clear())
})

test('has intent-aligned metadata and a crawlable link to the AI check-in', async ({page}) => {
  await page.goto('/play')

  await expect(page).toHaveTitle('WhoCards | Play Online Now')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Play WhoCards free online/
  )
  await expect(page.locator('a[href="/ai-at-work"]')).toHaveText(
    'Try these AI team check-in questions'
  )
  await expect(page.getByText('More conversation decks')).toBeVisible()
  // Scope to the deck disclosure; the Events nav dropdown also renders <details>.
  await expect(
    page.locator('details').filter({hasText: 'More conversation decks'})
  ).not.toHaveAttribute('open', '')
})

test('keeps the optional deck link away from the question on a narrow landscape viewport', async ({
  page,
}) => {
  await page.setViewportSize({width: 667, height: 375})
  await page.goto('/play?q=1&lang=en')

  const questionBox = await heading(page).boundingBox()
  const moreDecksBox = await page.getByText('More conversation decks').boundingBox()

  expect(questionBox).not.toBeNull()
  expect(moreDecksBox).not.toBeNull()
  expect((questionBox?.y ?? 0) + (questionBox?.height ?? 0)).toBeLessThanOrEqual(
    moreDecksBox?.y ?? 0
  )
})

test('loads the question selected by ?q= in the requested language', async ({page}) => {
  await page.goto('/play?q=1&lang=en')
  await expect(heading(page)).toHaveText(q1.en)
})

test('next and previous navigate the deck deterministically', async ({page}) => {
  await page.goto('/play?q=1&lang=en')
  await expect(heading(page)).toHaveText(q1.en)

  const prev = page.getByRole('button', {name: 'previous question'})
  await expect(prev).toBeDisabled()

  await page.getByRole('button', {name: 'next question'}).click()
  await expect(heading(page)).toHaveText(q2.en)

  await expect(prev).toBeEnabled()
  await prev.click()
  await expect(heading(page)).toHaveText(q1.en)
})

test('the language select switches the question text (>2 languages)', async ({page}) => {
  await page.goto('/play?q=1&lang=en')
  await expect(heading(page)).toHaveText(q1.en)

  // The library deck ships 14 languages, so the control is a <select>.
  await page.getByLabel('change language').selectOption('de')
  await expect(heading(page)).toHaveText(q1.de)

  await page.getByLabel('change language').selectOption('fr')
  await expect(heading(page)).toHaveText(q1.fr)
})

test('keeps ?q= and ?lang= in the URL so links stay shareable', async ({page}) => {
  await page.goto('/play?q=1&lang=en')
  await expect(heading(page)).toHaveText(q1.en)

  await page.getByLabel('change language').selectOption('de')
  await expect(heading(page)).toHaveText(q1.de)

  // Play mirrors the current question + language into the URL.
  await expect.poll(() => new URL(page.url()).searchParams.get('lang')).toBe('de')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('1')
})

test('the deck route /play/ai-at-work renders and navigates', async ({page}) => {
  const response = await page.goto('/play/ai-at-work')
  expect(response?.status()).toBe(200)

  const first = await heading(page).textContent()
  expect(first?.trim().length ?? 0).toBeGreaterThan(0)

  await page.getByRole('button', {name: 'next question'}).click()
  await expect(heading(page)).not.toHaveText(first ?? '')
})

// Share sheet (#155): headless Chromium has no OS file-share target, so
// `supportsFileShare` is false and the image rows render as their honest
// "Download ..." labels rather than "Story image"/"Post image".
test('the Share control opens a sheet with link/story/post rows', async ({page}) => {
  await page.goto('/play?q=1&lang=en')
  await expect(heading(page)).toHaveText(q1.en)

  await page.getByRole('button', {name: 'share question'}).click()
  await expect(page.getByRole('button', {name: 'Share link'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Download story image'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Download post image'})).toBeVisible()

  await page.getByRole('button', {name: 'close share sheet'}).click()
  await expect(page.getByRole('button', {name: 'Share link'})).toBeHidden()
})

// ai-at-work carries its own inline questions (ids like "ai-3") — NOT a subset of
// the Pool the /share-card endpoint renders from (ADR-0007). Regression guard for
// the review finding on #158: the image rows must not appear for a non-Pool deck.
test('the Share sheet on a non-Pool deck (ai-at-work) offers Share link only', async ({page}) => {
  await page.goto('/play/ai-at-work')
  await expect(heading(page)).toBeVisible()

  await page.getByRole('button', {name: 'share question'}).click()
  await expect(page.getByRole('button', {name: 'Share link'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Download story image'})).toHaveCount(0)
  await expect(page.getByRole('button', {name: 'Download post image'})).toHaveCount(0)
})

const prompt = (page: Page) => page.locator('a[data-source="shared_question"]')

test.describe('Get the App prompt on a shared question', () => {
  test('shows iPhone visitors a UTM-tagged App Store link', async ({browser}) => {
    const iphone = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    })
    const page = await iphone.newPage()
    await page.goto('/play?lang=en&q=1&utm_source=share&utm_medium=app')

    await expect(heading(page)).toHaveText(q1.en)
    await expect(prompt(page)).toBeVisible()
    await expect(prompt(page)).toHaveText('Get the App')
    const url = new URL((await prompt(page).getAttribute('href'))!)
    expect(url.hostname).toBe('apps.apple.com')
    expect(url.searchParams.get('utm_medium')).toBe('shared_question')
    await iphone.close()
  })

  test('stays hidden off iOS', async ({page}) => {
    await page.goto('/play?lang=en&q=1')
    await expect(heading(page)).toHaveText(q1.en)
    await expect(prompt(page)).toBeHidden()
  })

  test('is absent without a shared question', async ({page}) => {
    await page.goto('/play')
    await expect(prompt(page)).toHaveCount(0)
  })
})
